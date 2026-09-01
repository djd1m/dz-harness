#!/usr/bin/env bash
# Package-owned deterministic traceability gate for role-mapped SPARC documents.
set -uo pipefail

export LC_ALL=C

usage() {
  cat >&2 <<'USAGE'
Usage: check-pipeline-gaps.sh PROJECT_ROOT [--traceability]
       [--role-map-source PATH] [--project-role-map-source PATH]

Exit 0: all checked ID sets are equal
Exit 1: a named content or traceability gap was established
Exit 2: a trustworthy comparison could not be established
USAGE
}

not_established() {
  printf 'NOT-ESTABLISHED %s\n' "$*"
  INCONCLUSIVE_COUNT=$((INCONCLUSIVE_COUNT + 1))
}

content_gap() {
  printf '%s\n' "$*"
  GAP_COUNT=$((GAP_COUNT + 1))
}

validate_role_target() {
  local role="$1" value="$2" source="$3"
  if [ -z "$value" ]; then
    printf 'NOT-ESTABLISHED role-map=%s role=%s empty target\n' "$source" "$role"
    return 1
  fi
  case "$value" in
    /*|../*|*/../*|*/..|..)
      printf 'NOT-ESTABLISHED role-map=%s role=%s escaping target=%s\n' \
        "$source" "$role" "$value"
      return 1
      ;;
  esac
  return 0
}

parse_role_map() {
  local source="$1" heading="$2" prefix="$3"
  local section line role value variable seen_spec=0 seen_pseudo=0 seen_arch=0 seen_ref=0 seen_comp=0

  if [ ! -f "$source" ] || [ ! -r "$source" ] || [ -L "$source" ]; then
    printf 'NOT-ESTABLISHED role-map=%s is missing unreadable or a symlink\n' "$source"
    return 1
  fi

  section="$(awk -v wanted="$heading" '
    BEGIN { in_section = 0; in_yaml = 0; in_map = 0 }
    { sub(/\r$/, "") }
    $0 == wanted { in_section = 1; next }
    in_section && /^#{1,3}[[:space:]]/ { exit }
    in_section && $0 == "```yaml" { in_yaml = 1; next }
    in_yaml && $0 == "DOCUMENT_ROLE_MAP:" { in_map = 1; next }
    in_map && /^```/ { exit }
    in_map { print }
  ' "$source")"
  if [ -z "$section" ]; then
    printf 'NOT-ESTABLISHED role-map=%s heading=%s has no DOCUMENT_ROLE_MAP\n' "$source" "$heading"
    return 1
  fi

  while IFS= read -r line; do
    [ -z "$line" ] && continue
    if [[ ! "$line" =~ ^[[:space:]][[:space:]]([a-zA-Z0-9_-]+):[[:space:]]*(.*)$ ]]; then
      printf 'NOT-ESTABLISHED role-map=%s malformed line=%s\n' "$source" "$line"
      return 1
    fi
    role="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    value="${value%$'\r'}"
    while [[ "$value" == *[[:space:]] ]]; do value="${value%?}"; done
    case "$role" in
      specification) variable=SPECIFICATION; seen_spec=$((seen_spec + 1)) ;;
      pseudocode) variable=PSEUDOCODE; seen_pseudo=$((seen_pseudo + 1)) ;;
      architecture) variable=ARCHITECTURE; seen_arch=$((seen_arch + 1)) ;;
      refinement) variable=REFINEMENT; seen_ref=$((seen_ref + 1)) ;;
      completion) variable=COMPLETION; seen_comp=$((seen_comp + 1)) ;;
      *) printf 'NOT-ESTABLISHED role-map=%s unknown role=%s\n' "$source" "$role"; return 1 ;;
    esac
    if ! validate_role_target "$role" "$value" "$source"; then return 1; fi
    printf -v "${prefix}_${variable}" '%s' "$value"
  done <<< "$section"

  if [ "$seen_spec" -ne 1 ] || [ "$seen_pseudo" -ne 1 ] || [ "$seen_arch" -ne 1 ] || \
     [ "$seen_ref" -ne 1 ] || [ "$seen_comp" -ne 1 ]; then
    printf 'NOT-ESTABLISHED role-map=%s requires exactly specification pseudocode architecture refinement completion; counts=%s,%s,%s,%s,%s\n' \
      "$source" "$seen_spec" "$seen_pseudo" "$seen_arch" "$seen_ref" "$seen_comp"
    return 1
  fi
}

extract_specification() {
  local source="$1" output="$2"
  awk '
    BEGIN { in_fence = 0; fence = "" }
    {
      sub(/\r$/, "")
      trimmed = $0
      sub(/^[[:space:]]*/, "", trimmed)
      prefix = substr(trimmed, 1, 3)
      if (prefix == "```" || prefix == "~~~") {
        marker = substr(prefix, 1, 1)
        if (!in_fence) { in_fence = 1; fence = marker }
        else if (marker == fence) { in_fence = 0; fence = "" }
        next
      }
      if (in_fence) next
    }
    /^###[[:space:]]+(FR|NFR|AC)-/ {
      line = $0
      sub(/^###[[:space:]]+/, "", line)
      if (match(line, /^(FR|NFR|AC)-[A-Za-z0-9]+(-[A-Za-z0-9]+)*-[0-9]+([[:space:]]|$)/)) {
        id = substr(line, RSTART, RLENGTH)
        sub(/[[:space:]]$/, "", id)
        print "ID\t" id
      } else {
        print "MALFORMED\t" NR "\t" line
      }
    }
  ' "$source" > "$output"
}

extract_pseudocode() {
  local source="$1" output="$2"
  awk '
    BEGIN { in_algorithm = 0; claims = 0; algorithm_line = 0; in_fence = 0; fence = "" }
    {
      sub(/\r$/, "")
      trimmed = $0
      sub(/^[[:space:]]*/, "", trimmed)
      prefix = substr(trimmed, 1, 3)
      if (prefix == "```" || prefix == "~~~") {
        marker = substr(prefix, 1, 1)
        if (!in_fence) { in_fence = 1; fence = marker }
        else if (marker == fence) { in_fence = 0; fence = "" }
        next
      }
      if (in_fence) next
    }
    /^###[[:space:]]+Algorithm:/ {
      if (in_algorithm && claims == 0) print "UNKEYED\t" algorithm_line
      in_algorithm = 1
      claims = 0
      algorithm_line = NR
      next
    }
    /^#/ {
      if (in_algorithm && claims == 0) print "UNKEYED\t" algorithm_line
      in_algorithm = 0
      claims = 0
      next
    }
    in_algorithm && /^REQUIREMENT:/ {
      line = $0
      if (match(line, /^REQUIREMENT: `(FR|NFR|AC)-[A-Za-z0-9]+(-[A-Za-z0-9]+)*-[0-9]+`$/)) {
        sub(/^REQUIREMENT: `/, "", line)
        sub(/`$/, "", line)
        print "ID\t" line
        claims++
      } else {
        print "MALFORMED\t" NR "\t" line
      }
    }
    END { if (in_algorithm && claims == 0) print "UNKEYED\t" algorithm_line }
  ' "$source" > "$output"
}

validate_extraction() {
  local records="$1" role="$2" contour="$3" expected_slug="$4" ids="$5"
  local kind first rest id duplicate
  : > "$ids"
  while IFS=$'\t' read -r kind first rest; do
    [ -z "$kind" ] && continue
    case "$kind" in
      ID)
        id="$first"
        if [ -n "$expected_slug" ] && [[ ! "$id" =~ ^(FR|NFR|AC)-${expected_slug}-[0-9]+$ ]]; then
          content_gap "MALFORMED $contour $role expected-slug=$expected_slug id=$id"
        else
          printf '%s\n' "$id" >> "$ids"
        fi
        ;;
      MALFORMED)
        content_gap "MALFORMED $contour $role line=$first value=$rest"
        ;;
      UNKEYED)
        content_gap "GAP $contour $role unkeyed-algorithm line=$first"
        ;;
      *)
        content_gap "MALFORMED $contour $role extractor-record=$kind"
        ;;
    esac
  done < "$records"

  if [ -s "$ids" ]; then
    while IFS= read -r duplicate; do
      [ -n "$duplicate" ] && content_gap "DUPLICATE $contour $role $duplicate"
    done < <(sort "$ids" | uniq -d)
  fi
}

safe_role_file() {
  local contour="$1" role="$2" directory="$3" target="$4"
  local file="$directory/$target" current="$directory" component
  local -a target_components
  IFS='/' read -r -a target_components <<< "$target"
  for component in "${target_components[@]}"; do
    current="$current/$component"
    if [ -L "$current" ]; then
      not_established "contour=$contour role=$role path=$current symlink is not allowed"
      return 1
    fi
  done
  if [ ! -f "$file" ] || [ ! -r "$file" ]; then
    not_established "contour=$contour role=$role path=$file missing or unreadable"
    return 1
  fi
  return 0
}

process_contour() {
  local contour="$1" directory="$2" spec_target="$3" pseudo_target="$4" expected_slug="$5"
  local spec_file="$directory/$spec_target" pseudo_file="$directory/$pseudo_target"
  local stem spec_records pseudo_records spec_raw pseudo_raw spec_ids pseudo_ids missing orphan
  local requirements algorithms missing_count orphan_count id before_gaps

  printf 'TRACE contour=%s specification=%s pseudocode=%s\n' "$contour" "$spec_file" "$pseudo_file"
  if [ -L "$directory" ]; then
    not_established "contour=$contour path=$directory symlink directory is not allowed"
    return
  fi
  if ! safe_role_file "$contour" specification "$directory" "$spec_target"; then return; fi
  if ! safe_role_file "$contour" pseudocode "$directory" "$pseudo_target"; then return; fi

  CONTOUR_SEQ=$((CONTOUR_SEQ + 1))
  stem="$TEMP_DIR/contour-$CONTOUR_SEQ"
  spec_records="$stem.spec.records"
  pseudo_records="$stem.pseudo.records"
  spec_raw="$stem.spec.raw"
  pseudo_raw="$stem.pseudo.raw"
  spec_ids="$stem.spec.ids"
  pseudo_ids="$stem.pseudo.ids"
  missing="$stem.missing.ids"
  orphan="$stem.orphan.ids"

  if ! extract_specification "$spec_file" "$spec_records"; then
    not_established "contour=$contour specification extractor failed path=$spec_file"
    return
  fi
  if ! extract_pseudocode "$pseudo_file" "$pseudo_records"; then
    not_established "contour=$contour pseudocode extractor failed path=$pseudo_file"
    return
  fi

  before_gaps=$GAP_COUNT
  validate_extraction "$spec_records" specification "$contour" "$expected_slug" "$spec_raw"
  validate_extraction "$pseudo_records" pseudocode "$contour" "$expected_slug" "$pseudo_raw"
  sort -u "$spec_raw" > "$spec_ids"
  sort -u "$pseudo_raw" > "$pseudo_ids"

  requirements=$(wc -l < "$spec_ids"); requirements=${requirements//[[:space:]]/}
  algorithms=$(wc -l < "$pseudo_ids"); algorithms=${algorithms//[[:space:]]/}
  if [ "$requirements" -eq 0 ] && [ "$algorithms" -eq 0 ]; then
    content_gap "GAP $contour specification no-declared-machine-ids"
  fi

  # These are deliberately two independent calls. Neither direction short-circuits the other.
  if ! comm -23 "$spec_ids" "$pseudo_ids" > "$missing"; then
    not_established "contour=$contour specification->pseudocode comparison failed"
    return
  fi
  if ! comm -23 "$pseudo_ids" "$spec_ids" > "$orphan"; then
    not_established "contour=$contour pseudocode->specification comparison failed"
    return
  fi

  missing_count=$(wc -l < "$missing"); missing_count=${missing_count//[[:space:]]/}
  orphan_count=$(wc -l < "$orphan"); orphan_count=${orphan_count//[[:space:]]/}
  printf 'COUNT requirements=%s algorithms=%s missing-algorithm=%s orphan-algorithm=%s\n' \
    "$requirements" "$algorithms" "$missing_count" "$orphan_count"
  while IFS= read -r id; do
    [ -n "$id" ] && content_gap "GAP $contour specification->pseudocode $id"
  done < "$missing"
  while IFS= read -r id; do
    [ -n "$id" ] && content_gap "GAP $contour pseudocode->specification $id"
  done < "$orphan"

  if [ "$GAP_COUNT" -eq "$before_gaps" ]; then
    printf 'PASS contour=%s bidirectional traceability complete\n' "$contour"
  fi
}

GAP_COUNT=0
INCONCLUSIVE_COUNT=0
FEATURE_COUNT=0
CONTOUR_SEQ=0

PROJECT_ROOT="${1:-}"
if [ -z "$PROJECT_ROOT" ]; then
  usage
  exit 2
fi
shift

FEATURE_ROLE_MAP_SOURCE=""
PROJECT_ROLE_MAP_SOURCE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --traceability) shift ;;
    --role-map-source)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      FEATURE_ROLE_MAP_SOURCE="$2"; shift 2
      ;;
    --project-role-map-source)
      [ "$#" -ge 2 ] || { usage; exit 2; }
      PROJECT_ROLE_MAP_SOURCE="$2"; shift 2
      ;;
    *) printf 'NOT-ESTABLISHED unknown argument=%s\n' "$1"; usage; exit 2 ;;
  esac
done

if [ ! -d "$PROJECT_ROOT" ] || [ -L "$PROJECT_ROOT" ]; then
  printf 'NOT-ESTABLISHED project-root=%s missing or a symlink\n' "$PROJECT_ROOT"
  exit 2
fi

for utility in awk sort uniq comm wc mktemp; do
  if ! command -v "$utility" >/dev/null 2>&1; then
    printf 'NOT-ESTABLISHED required utility=%s is unavailable\n' "$utility"
    exit 2
  fi
done

FEATURE_ROLE_MAP_SOURCE="${FEATURE_ROLE_MAP_SOURCE:-$PROJECT_ROOT/.claude/commands/feature.md}"
PROJECT_ROLE_MAP_SOURCE="${PROJECT_ROLE_MAP_SOURCE:-$PROJECT_ROOT/.claude/skills/sparc-prd-mini/SKILL.md}"

if ! parse_role_map "$FEATURE_ROLE_MAP_SOURCE" '### Phase 1 document role map' FEATURE; then
  INCONCLUSIVE_COUNT=$((INCONCLUSIVE_COUNT + 1))
fi
if ! parse_role_map "$PROJECT_ROLE_MAP_SOURCE" '### Project-level default' PROJECT; then
  INCONCLUSIVE_COUNT=$((INCONCLUSIVE_COUNT + 1))
fi
if [ "$INCONCLUSIVE_COUNT" -gt 0 ]; then
  printf 'VERDICT traceability=NOT-ESTABLISHED features=0 gaps=0 inconclusive=%s\n' \
    "$INCONCLUSIVE_COUNT"
  exit 2
fi

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/p-replicator-traceability.XXXXXX")" || {
  printf 'NOT-ESTABLISHED could not create private temporary directory\n'
  exit 2
}
case "$TEMP_DIR" in
  "${TMPDIR:-/tmp}"/p-replicator-traceability.*) ;;
  *) printf 'NOT-ESTABLISHED unsafe temporary directory=%s\n' "$TEMP_DIR"; exit 2 ;;
esac
trap 'if [ -n "${TEMP_DIR:-}" ] && [ -d "$TEMP_DIR" ]; then rm -r -- "$TEMP_DIR"; fi' EXIT HUP INT TERM

DOCS_ROOT="$PROJECT_ROOT/docs"
CHECKED_CONTOURS=0
if [ ! -d "$DOCS_ROOT" ] || [ -L "$DOCS_ROOT" ]; then
  not_established "docs-root=$DOCS_ROOT missing or a symlink"
else
  PROJECT_SPEC="$DOCS_ROOT/$PROJECT_SPECIFICATION"
  PROJECT_PSEUDO="$DOCS_ROOT/$PROJECT_PSEUDOCODE"
  if [ -e "$PROJECT_SPEC" ] || [ -L "$PROJECT_SPEC" ] || \
     [ -e "$PROJECT_PSEUDO" ] || [ -L "$PROJECT_PSEUDO" ]; then
    process_contour project "$DOCS_ROOT" "$PROJECT_SPECIFICATION" "$PROJECT_PSEUDOCODE" ''
    CHECKED_CONTOURS=$((CHECKED_CONTOURS + 1))
  fi

  FEATURES_ROOT="$DOCS_ROOT/features"
  if [ -L "$FEATURES_ROOT" ]; then
    not_established "features-root=$FEATURES_ROOT symlink is not allowed"
  elif [ -d "$FEATURES_ROOT" ]; then
    for feature_dir in "$FEATURES_ROOT"/*; do
      if [ ! -e "$feature_dir" ] && [ ! -L "$feature_dir" ]; then continue; fi
      if [ ! -d "$feature_dir" ] && [ ! -L "$feature_dir" ]; then continue; fi
      feature_slug="${feature_dir##*/}"
      FEATURE_COUNT=$((FEATURE_COUNT + 1))
      CHECKED_CONTOURS=$((CHECKED_CONTOURS + 1))
      if [[ ! "$feature_slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
        not_established "contour=$feature_slug invalid feature slug"
        continue
      fi
      process_contour "$feature_slug" "$feature_dir" \
        "$FEATURE_SPECIFICATION" "$FEATURE_PSEUDOCODE" "$feature_slug"
    done
  fi
fi

if [ "$CHECKED_CONTOURS" -eq 0 ]; then
  not_established "project=$PROJECT_ROOT has no applicable project or feature contour"
fi

if [ "$GAP_COUNT" -gt 0 ]; then
  printf 'VERDICT traceability=FAIL features=%s gaps=%s inconclusive=%s\n' \
    "$FEATURE_COUNT" "$GAP_COUNT" "$INCONCLUSIVE_COUNT"
  exit 1
fi
if [ "$INCONCLUSIVE_COUNT" -gt 0 ]; then
  printf 'VERDICT traceability=NOT-ESTABLISHED features=%s gaps=0 inconclusive=%s\n' \
    "$FEATURE_COUNT" "$INCONCLUSIVE_COUNT"
  exit 2
fi
printf 'VERDICT traceability=PASS features=%s gaps=0 inconclusive=0\n' "$FEATURE_COUNT"
exit 0
