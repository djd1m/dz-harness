#!/usr/bin/env bash
# Package-owned deterministic traceability gate for role-mapped SPARC documents.
set -uo pipefail

export LC_ALL=C

usage() {
  cat >&2 <<'USAGE'
Usage: check-pipeline-gaps.sh PROJECT_ROOT [--traceability] [--completion]
       [--report-revision] [--criterion-scenarios]
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

mode_not_established() {
  local mode="$1"
  shift
  printf 'NOT-ESTABLISHED %s\n' "$*"
  case "$mode" in
    completion) COMPLETION_INCONCLUSIVE_COUNT=$((COMPLETION_INCONCLUSIVE_COUNT + 1)) ;;
    report-revision) REVISION_INCONCLUSIVE_COUNT=$((REVISION_INCONCLUSIVE_COUNT + 1)) ;;
    criterion-scenarios) SCENARIO_INCONCLUSIVE_COUNT=$((SCENARIO_INCONCLUSIVE_COUNT + 1)) ;;
  esac
}

mode_gap() {
  local mode="$1"
  shift
  printf '%s\n' "$*"
  case "$mode" in
    completion) COMPLETION_GAP_COUNT=$((COMPLETION_GAP_COUNT + 1)) ;;
    report-revision) REVISION_GAP_COUNT=$((REVISION_GAP_COUNT + 1)) ;;
    criterion-scenarios) SCENARIO_GAP_COUNT=$((SCENARIO_GAP_COUNT + 1)) ;;
  esac
}

safe_mode_role_file() {
  local mode="$1" contour="$2" role="$3" directory="$4" target="$5"
  local file="$directory/$target" current="$directory" component
  local -a target_components
  IFS='/' read -r -a target_components <<< "$target"
  for component in "${target_components[@]}"; do
    current="$current/$component"
    if [ -L "$current" ]; then
      mode_not_established "$mode" "contour=$contour role=$role path=$current symlink is not allowed"
      return 1
    fi
  done
  if [ ! -f "$file" ] || [ ! -r "$file" ]; then
    mode_not_established "$mode" "contour=$contour role=$role path=$file missing or unreadable"
    return 1
  fi
  return 0
}

prepare_ac_ids() {
  local mode="$1" contour="$2" spec_file="$3" stem="$4" output="$5"
  local records="$stem.spec.records" raw="$stem.spec.ac.raw"
  local kind first rest duplicate
  if ! extract_specification "$spec_file" "$records"; then
    mode_not_established "$mode" "contour=$contour specification extractor failed path=$spec_file"
    return 1
  fi
  : > "$raw"
  while IFS=$'\t' read -r kind first rest; do
    [ -z "$kind" ] && continue
    case "$kind" in
      ID)
        case "$first" in AC-*) printf '%s\n' "$first" >> "$raw" ;; esac
        ;;
      MALFORMED)
        case "$rest" in
          AC-*) mode_gap "$mode" "MALFORMED contour=$contour $mode specification line=$first value=$rest" ;;
        esac
        ;;
    esac
  done < "$records"
  if [ -s "$raw" ]; then
    while IFS= read -r duplicate; do
      [ -n "$duplicate" ] && mode_gap "$mode" "DUPLICATE contour=$contour $mode specification $duplicate"
    done < <(sort "$raw" | uniq -d)
  fi
  sort -u "$raw" > "$output"
}

extract_completion_rows() {
  local source="$1" output="$2"
  awk '
    function trim(value) {
      sub(/^[[:space:]]*/, "", value)
      sub(/[[:space:]]*$/, "", value)
      return value
    }
    BEGIN { section = 0; header = 0; separator = 0 }
    { sub(/\r$/, "") }
    $0 == "## Criterion coverage" { section = 1; next }
    section && /^##[[:space:]]/ { exit }
    section && trim($0) == "| Criterion | Test file | Test title |" {
      header = 1
      next
    }
    header && !separator {
      if (trim($0) ~ /^\|[[:space:]]*-+[[:space:]]*\|[[:space:]]*-+[[:space:]]*\|[[:space:]]*-+[[:space:]]*\|$/) {
        separator = 1
        next
      }
      print "ERROR\tseparator"
      exit
    }
    separator {
      if ($0 ~ /^[[:space:]]*$/ || $0 ~ /^##?[[:space:]]/ || $0 !~ /^[[:space:]]*\|/) exit
      count = split($0, cell, "|")
      if (count != 5) { print "ERROR\trow\t" NR; next }
      print "ROW\t" trim(cell[2]) "\t" trim(cell[3]) "\t" trim(cell[4])
    }
    END {
      if (!section) print "ERROR\tsection"
      else if (!header) print "ERROR\theader"
      else if (!separator) print "ERROR\tseparator"
    }
  ' "$source" > "$output"
}

extract_scenario_rows() {
  local source="$1" output="$2"
  awk '
    function trim(value) {
      sub(/^[[:space:]]*/, "", value)
      sub(/[[:space:]]*$/, "", value)
      return value
    }
    BEGIN { section = 0; header = 0; separator = 0 }
    { sub(/\r$/, "") }
    $0 == "## Criterion scenarios" { section = 1; next }
    section && /^##[[:space:]]/ { exit }
    section && trim($0) == "| Criterion | Scenario |" { header = 1; next }
    header && !separator {
      if (trim($0) ~ /^\|[[:space:]]*-+[[:space:]]*\|[[:space:]]*-+[[:space:]]*\|$/) {
        separator = 1
        next
      }
      print "ERROR\tseparator"
      exit
    }
    separator {
      if ($0 ~ /^[[:space:]]*$/ || $0 ~ /^##?[[:space:]]/ || $0 !~ /^[[:space:]]*\|/) exit
      count = split($0, cell, "|")
      if (count != 4) { print "ERROR\trow\t" NR; next }
      print "ROW\t" trim(cell[2]) "\t" trim(cell[3])
    }
    END {
      if (!section) print "ERROR\tsection"
      else if (!header) print "ERROR\theader"
      else if (!separator) print "ERROR\tseparator"
    }
  ' "$source" > "$output"
}

coverage_test_file() {
  local contour="$1" id="$2" relative="$3" title="$4"
  local candidate="$PROJECT_ROOT/$relative" current="$PROJECT_ROOT" component grep_status
  local -a components
  if [ -z "$relative" ]; then
    mode_gap completion "GAP contour=$contour completion $id test file is empty"
    return
  fi
  case "$relative" in
    /*|../*|*/../*|*/..|..)
      mode_gap completion "GAP contour=$contour completion $id test file $relative escapes the project root"
      return
      ;;
  esac
  IFS='/' read -r -a components <<< "$relative"
  for component in "${components[@]}"; do
    current="$current/$component"
    if [ -L "$current" ]; then
      mode_gap completion "GAP contour=$contour completion $id test file $relative uses a symlink"
      return
    fi
  done
  if [ ! -e "$candidate" ]; then
    mode_gap completion "GAP contour=$contour completion $id test file $relative does not exist"
    return
  fi
  if [ ! -f "$candidate" ]; then
    mode_gap completion "GAP contour=$contour completion $id test file $relative is not a regular file"
    return
  fi
  if [ -z "$title" ]; then
    mode_gap completion "GAP contour=$contour completion $id test title is empty"
    return
  fi
  grep -Fq -- "$title" "$candidate"
  grep_status=$?
  if [ "$grep_status" -eq 1 ]; then
    mode_gap completion "GAP contour=$contour completion $id test file $relative does not contain title \"$title\""
  elif [ "$grep_status" -ne 0 ]; then
    mode_not_established completion "contour=$contour completion $id test file $relative could not be read"
  fi
}

process_completion_contour() {
  local contour="$1" directory="$2" spec_target="$3" completion_target="$4"
  local spec_file="$directory/$spec_target" completion_file="$directory/$completion_target"
  local stem spec_ids records row_ids missing orphan duplicates kind id test_file title detail
  if [ -L "$directory" ]; then
    mode_not_established completion "contour=$contour path=$directory symlink directory is not allowed"
    return
  fi
  if ! safe_mode_role_file completion "$contour" specification "$directory" "$spec_target"; then return; fi
  if ! safe_mode_role_file completion "$contour" completion "$directory" "$completion_target"; then return; fi
  MODE_CONTOUR_SEQ=$((MODE_CONTOUR_SEQ + 1))
  stem="$TEMP_DIR/mode-contour-$MODE_CONTOUR_SEQ"
  spec_ids="$stem.spec.ids"
  records="$stem.completion.records"
  row_ids="$stem.completion.ids"
  missing="$stem.completion.missing"
  orphan="$stem.completion.orphan"
  duplicates="$stem.completion.duplicates"
  if ! prepare_ac_ids completion "$contour" "$spec_file" "$stem" "$spec_ids"; then return; fi
  if ! extract_completion_rows "$completion_file" "$records"; then
    mode_not_established completion "contour=$contour completion table could not be read from $completion_target"
    return
  fi
  if awk -F '\t' '$1 == "ERROR" { found = 1 } END { exit !found }' "$records"; then
    detail="$(awk -F '\t' '$1 == "ERROR" { print $2; exit }' "$records")"
    mode_not_established completion "contour=$contour completion Criterion coverage table missing or malformed detail=$detail"
    return
  fi
  : > "$row_ids"
  while IFS=$'\t' read -r kind id test_file title; do
    [ "$kind" = ROW ] || continue
    printf '%s\n' "$id" >> "$row_ids"
    coverage_test_file "$contour" "$id" "$test_file" "$title"
  done < "$records"
  sort "$row_ids" | uniq -d > "$duplicates"
  while IFS= read -r id; do
    [ -n "$id" ] && mode_gap completion "GAP contour=$contour completion $id has duplicate rows in Criterion coverage"
  done < "$duplicates"
  sort -u "$row_ids" > "$stem.completion.unique"
  comm -23 "$spec_ids" "$stem.completion.unique" > "$missing"
  comm -23 "$stem.completion.unique" "$spec_ids" > "$orphan"
  while IFS= read -r id; do
    [ -n "$id" ] && mode_gap completion "GAP contour=$contour completion $id has no row in Criterion coverage"
  done < "$missing"
  while IFS= read -r id; do
    [ -n "$id" ] && mode_gap completion "GAP contour=$contour completion row $id is not declared in the specification"
  done < "$orphan"
}

process_revision_contour() {
  local contour="$1" directory="$2" spec_target="$3"
  local spec_file="$directory/$spec_target" report_file="$directory/validation-report.md"
  local lines declared actual count
  if [ -L "$directory" ]; then
    mode_not_established report-revision "contour=$contour path=$directory symlink directory is not allowed"
    return
  fi
  if ! safe_mode_role_file report-revision "$contour" specification "$directory" "$spec_target"; then return; fi
  if ! safe_mode_role_file report-revision "$contour" validation-report "$directory" validation-report.md; then return; fi
  lines="$(awk 'NR <= 20 { sub(/\r$/, "") } NR <= 20 && /^Spec revision:/ { print }' "$report_file")" || {
    mode_not_established report-revision "contour=$contour report-revision validation-report.md could not be read"
    return
  }
  count="$(printf '%s\n' "$lines" | awk 'NF { count++ } END { print count + 0 }')"
  if [ "$count" -eq 0 ]; then
    mode_not_established report-revision "contour=$contour report-revision line missing in validation-report.md"
    return
  fi
  if [ "$count" -ne 1 ] || [[ ! "$lines" =~ ^Spec[[:space:]]revision:[[:space:]]sha256:([a-f0-9]{64})$ ]]; then
    mode_not_established report-revision "contour=$contour report-revision line malformed or repeated in validation-report.md"
    return
  fi
  declared="${BASH_REMATCH[1]}"
  actual="$(sha256sum -- "$spec_file")" || {
    mode_not_established report-revision "contour=$contour report-revision specification digest could not be established"
    return
  }
  actual="${actual%% *}"
  if [ "$declared" != "$actual" ]; then
    mode_gap report-revision "GAP contour=$contour report-revision validation-report.md sha256:${declared:0:12}… != specification sha256:${actual:0:12}…"
  fi
}

process_scenario_contour() {
  local contour="$1" directory="$2" spec_target="$3"
  local spec_file="$directory/$spec_target" report_file="$directory/validation-report.md"
  local stem spec_ids records row_ids missing orphan duplicates kind id scenario detail
  if [ -L "$directory" ]; then
    mode_not_established criterion-scenarios "contour=$contour path=$directory symlink directory is not allowed"
    return
  fi
  if ! safe_mode_role_file criterion-scenarios "$contour" specification "$directory" "$spec_target"; then return; fi
  if ! safe_mode_role_file criterion-scenarios "$contour" validation-report "$directory" validation-report.md; then return; fi
  MODE_CONTOUR_SEQ=$((MODE_CONTOUR_SEQ + 1))
  stem="$TEMP_DIR/mode-contour-$MODE_CONTOUR_SEQ"
  spec_ids="$stem.spec.ids"
  records="$stem.scenario.records"
  row_ids="$stem.scenario.ids"
  missing="$stem.scenario.missing"
  orphan="$stem.scenario.orphan"
  duplicates="$stem.scenario.duplicates"
  if ! prepare_ac_ids criterion-scenarios "$contour" "$spec_file" "$stem" "$spec_ids"; then return; fi
  if ! extract_scenario_rows "$report_file" "$records"; then
    mode_not_established criterion-scenarios "contour=$contour criterion-scenarios table could not be read from validation-report.md"
    return
  fi
  if awk -F '\t' '$1 == "ERROR" { found = 1 } END { exit !found }' "$records"; then
    detail="$(awk -F '\t' '$1 == "ERROR" { print $2; exit }' "$records")"
    mode_not_established criterion-scenarios "contour=$contour criterion-scenarios table missing or malformed in validation-report.md detail=$detail"
    return
  fi
  : > "$row_ids"
  while IFS=$'\t' read -r kind id scenario; do
    [ "$kind" = ROW ] || continue
    printf '%s\n' "$id" >> "$row_ids"
    if [ -z "$scenario" ]; then
      mode_gap criterion-scenarios "GAP contour=$contour criterion-scenarios $id scenario is empty"
    fi
  done < "$records"
  sort "$row_ids" | uniq -d > "$duplicates"
  while IFS= read -r id; do
    [ -n "$id" ] && mode_gap criterion-scenarios "GAP contour=$contour criterion-scenarios $id has duplicate scenario rows"
  done < "$duplicates"
  sort -u "$row_ids" > "$stem.scenario.unique"
  comm -23 "$spec_ids" "$stem.scenario.unique" > "$missing"
  comm -23 "$stem.scenario.unique" "$spec_ids" > "$orphan"
  while IFS= read -r id; do
    [ -n "$id" ] && mode_gap criterion-scenarios "GAP contour=$contour criterion-scenarios $id has no scenario row"
  done < "$missing"
  while IFS= read -r id; do
    [ -n "$id" ] && mode_gap criterion-scenarios "GAP contour=$contour criterion-scenarios row $id is not declared in the specification"
  done < "$orphan"
}

emit_mode_verdict() {
  local mode="$1" gaps="$2" inconclusive="$3"
  if [ "$inconclusive" -gt 0 ]; then
    printf 'VERDICT %s=NOT-ESTABLISHED features=%s gaps=%s inconclusive=%s\n' \
      "$mode" "$FEATURE_COUNT" "$gaps" "$inconclusive"
    return 2
  fi
  if [ "$gaps" -gt 0 ]; then
    printf 'VERDICT %s=FAIL features=%s gaps=%s inconclusive=0\n' "$mode" "$FEATURE_COUNT" "$gaps"
    return 1
  fi
  printf 'VERDICT %s=PASS features=%s gaps=0 inconclusive=0\n' "$mode" "$FEATURE_COUNT"
  return 0
}

GAP_COUNT=0
INCONCLUSIVE_COUNT=0
FEATURE_COUNT=0
CONTOUR_SEQ=0
MODE_CONTOUR_SEQ=0
COMPLETION_GAP_COUNT=0
COMPLETION_INCONCLUSIVE_COUNT=0
REVISION_GAP_COUNT=0
REVISION_INCONCLUSIVE_COUNT=0
SCENARIO_GAP_COUNT=0
SCENARIO_INCONCLUSIVE_COUNT=0
TRACEABILITY_MODE=0
COMPLETION_MODE=0
REPORT_REVISION_MODE=0
CRITERION_SCENARIOS_MODE=0
EXPLICIT_MODE_COUNT=0

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
    --traceability) TRACEABILITY_MODE=1; EXPLICIT_MODE_COUNT=$((EXPLICIT_MODE_COUNT + 1)); shift ;;
    --completion) COMPLETION_MODE=1; EXPLICIT_MODE_COUNT=$((EXPLICIT_MODE_COUNT + 1)); shift ;;
    --report-revision) REPORT_REVISION_MODE=1; EXPLICIT_MODE_COUNT=$((EXPLICIT_MODE_COUNT + 1)); shift ;;
    --criterion-scenarios) CRITERION_SCENARIOS_MODE=1; EXPLICIT_MODE_COUNT=$((EXPLICIT_MODE_COUNT + 1)); shift ;;
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

# Before modes were added the checker always ran traceability, even without an explicit flag.
if [ "$EXPLICIT_MODE_COUNT" -eq 0 ]; then TRACEABILITY_MODE=1; fi

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
if [ "$REPORT_REVISION_MODE" -eq 1 ] && ! command -v sha256sum >/dev/null 2>&1; then
  printf 'NOT-ESTABLISHED required utility=sha256sum is unavailable\n'
  exit 2
fi
if [ "$COMPLETION_MODE" -eq 1 ] && ! command -v grep >/dev/null 2>&1; then
  printf 'NOT-ESTABLISHED required utility=grep is unavailable\n'
  exit 2
fi

FEATURE_ROLE_MAP_SOURCE="${FEATURE_ROLE_MAP_SOURCE:-$PROJECT_ROOT/.claude/commands/feature.md}"
PROJECT_ROLE_MAP_SOURCE="${PROJECT_ROLE_MAP_SOURCE:-$PROJECT_ROOT/.claude/skills/sparc-prd-mini/SKILL.md}"

if ! parse_role_map "$FEATURE_ROLE_MAP_SOURCE" '### Phase 1 document role map' FEATURE; then
  INCONCLUSIVE_COUNT=$((INCONCLUSIVE_COUNT + 1))
fi
if ! parse_role_map "$PROJECT_ROLE_MAP_SOURCE" '### Project-level default' PROJECT; then
  INCONCLUSIVE_COUNT=$((INCONCLUSIVE_COUNT + 1))
fi
if [ "$INCONCLUSIVE_COUNT" -gt 0 ]; then
  if [ "$TRACEABILITY_MODE" -eq 1 ]; then
    printf 'VERDICT traceability=NOT-ESTABLISHED features=0 gaps=0 inconclusive=%s\n' \
      "$INCONCLUSIVE_COUNT"
  fi
  if [ "$COMPLETION_MODE" -eq 1 ]; then
    printf 'VERDICT completion=NOT-ESTABLISHED features=0 gaps=0 inconclusive=%s\n' \
      "$INCONCLUSIVE_COUNT"
  fi
  if [ "$REPORT_REVISION_MODE" -eq 1 ]; then
    printf 'VERDICT report-revision=NOT-ESTABLISHED features=0 gaps=0 inconclusive=%s\n' \
      "$INCONCLUSIVE_COUNT"
  fi
  if [ "$CRITERION_SCENARIOS_MODE" -eq 1 ]; then
    printf 'VERDICT criterion-scenarios=NOT-ESTABLISHED features=0 gaps=0 inconclusive=%s\n' \
      "$INCONCLUSIVE_COUNT"
  fi
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
COMPLETION_CHECKED_CONTOURS=0
REVISION_CHECKED_CONTOURS=0
SCENARIO_CHECKED_CONTOURS=0
if [ ! -d "$DOCS_ROOT" ] || [ -L "$DOCS_ROOT" ]; then
  if [ "$TRACEABILITY_MODE" -eq 1 ]; then
    not_established "docs-root=$DOCS_ROOT missing or a symlink"
  fi
  if [ "$COMPLETION_MODE" -eq 1 ]; then
    mode_not_established completion "docs-root=$DOCS_ROOT missing or a symlink"
  fi
  if [ "$REPORT_REVISION_MODE" -eq 1 ]; then
    mode_not_established report-revision "docs-root=$DOCS_ROOT missing or a symlink"
  fi
  if [ "$CRITERION_SCENARIOS_MODE" -eq 1 ]; then
    mode_not_established criterion-scenarios "docs-root=$DOCS_ROOT missing or a symlink"
  fi
else
  PROJECT_SPEC="$DOCS_ROOT/$PROJECT_SPECIFICATION"
  PROJECT_PSEUDO="$DOCS_ROOT/$PROJECT_PSEUDOCODE"
  PROJECT_COMPLETION="$DOCS_ROOT/$PROJECT_COMPLETION"
  PROJECT_VALIDATION="$DOCS_ROOT/validation-report.md"
  if [ "$TRACEABILITY_MODE" -eq 1 ] && { [ -e "$PROJECT_SPEC" ] || [ -L "$PROJECT_SPEC" ] || \
     [ -e "$PROJECT_PSEUDO" ] || [ -L "$PROJECT_PSEUDO" ]; }; then
    process_contour project "$DOCS_ROOT" "$PROJECT_SPECIFICATION" "$PROJECT_PSEUDOCODE" ''
    CHECKED_CONTOURS=$((CHECKED_CONTOURS + 1))
  fi
  if [ "$COMPLETION_MODE" -eq 1 ] && { [ -e "$PROJECT_SPEC" ] || [ -L "$PROJECT_SPEC" ] || \
     [ -e "$PROJECT_COMPLETION" ] || [ -L "$PROJECT_COMPLETION" ]; }; then
    process_completion_contour project "$DOCS_ROOT" "$PROJECT_SPECIFICATION" "$PROJECT_COMPLETION"
    COMPLETION_CHECKED_CONTOURS=$((COMPLETION_CHECKED_CONTOURS + 1))
  fi
  if [ "$REPORT_REVISION_MODE" -eq 1 ] && { [ -e "$PROJECT_SPEC" ] || [ -L "$PROJECT_SPEC" ] || \
     [ -e "$PROJECT_VALIDATION" ] || [ -L "$PROJECT_VALIDATION" ]; }; then
    process_revision_contour project "$DOCS_ROOT" "$PROJECT_SPECIFICATION"
    REVISION_CHECKED_CONTOURS=$((REVISION_CHECKED_CONTOURS + 1))
  fi
  if [ "$CRITERION_SCENARIOS_MODE" -eq 1 ] && { [ -e "$PROJECT_SPEC" ] || [ -L "$PROJECT_SPEC" ] || \
     [ -e "$PROJECT_VALIDATION" ] || [ -L "$PROJECT_VALIDATION" ]; }; then
    process_scenario_contour project "$DOCS_ROOT" "$PROJECT_SPECIFICATION"
    SCENARIO_CHECKED_CONTOURS=$((SCENARIO_CHECKED_CONTOURS + 1))
  fi

  FEATURES_ROOT="$DOCS_ROOT/features"
  if [ -L "$FEATURES_ROOT" ]; then
    if [ "$TRACEABILITY_MODE" -eq 1 ]; then
      not_established "features-root=$FEATURES_ROOT symlink is not allowed"
    fi
    if [ "$COMPLETION_MODE" -eq 1 ]; then
      mode_not_established completion "features-root=$FEATURES_ROOT symlink is not allowed"
    fi
    if [ "$REPORT_REVISION_MODE" -eq 1 ]; then
      mode_not_established report-revision "features-root=$FEATURES_ROOT symlink is not allowed"
    fi
    if [ "$CRITERION_SCENARIOS_MODE" -eq 1 ]; then
      mode_not_established criterion-scenarios "features-root=$FEATURES_ROOT symlink is not allowed"
    fi
  elif [ -d "$FEATURES_ROOT" ]; then
    for feature_dir in "$FEATURES_ROOT"/*; do
      if [ ! -e "$feature_dir" ] && [ ! -L "$feature_dir" ]; then continue; fi
      if [ ! -d "$feature_dir" ] && [ ! -L "$feature_dir" ]; then continue; fi
      feature_slug="${feature_dir##*/}"
      FEATURE_COUNT=$((FEATURE_COUNT + 1))
      if [[ ! "$feature_slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
        if [ "$TRACEABILITY_MODE" -eq 1 ]; then
          CHECKED_CONTOURS=$((CHECKED_CONTOURS + 1))
          not_established "contour=$feature_slug invalid feature slug"
        fi
        if [ "$COMPLETION_MODE" -eq 1 ]; then
          COMPLETION_CHECKED_CONTOURS=$((COMPLETION_CHECKED_CONTOURS + 1))
          mode_not_established completion "contour=$feature_slug invalid feature slug"
        fi
        if [ "$REPORT_REVISION_MODE" -eq 1 ]; then
          REVISION_CHECKED_CONTOURS=$((REVISION_CHECKED_CONTOURS + 1))
          mode_not_established report-revision "contour=$feature_slug invalid feature slug"
        fi
        if [ "$CRITERION_SCENARIOS_MODE" -eq 1 ]; then
          SCENARIO_CHECKED_CONTOURS=$((SCENARIO_CHECKED_CONTOURS + 1))
          mode_not_established criterion-scenarios "contour=$feature_slug invalid feature slug"
        fi
        continue
      fi
      if [ "$TRACEABILITY_MODE" -eq 1 ]; then
        CHECKED_CONTOURS=$((CHECKED_CONTOURS + 1))
        process_contour "$feature_slug" "$feature_dir" \
          "$FEATURE_SPECIFICATION" "$FEATURE_PSEUDOCODE" "$feature_slug"
      fi
      if [ "$COMPLETION_MODE" -eq 1 ]; then
        COMPLETION_CHECKED_CONTOURS=$((COMPLETION_CHECKED_CONTOURS + 1))
        process_completion_contour "$feature_slug" "$feature_dir" \
          "$FEATURE_SPECIFICATION" "$FEATURE_COMPLETION"
      fi
      if [ "$REPORT_REVISION_MODE" -eq 1 ]; then
        REVISION_CHECKED_CONTOURS=$((REVISION_CHECKED_CONTOURS + 1))
        process_revision_contour "$feature_slug" "$feature_dir" "$FEATURE_SPECIFICATION"
      fi
      if [ "$CRITERION_SCENARIOS_MODE" -eq 1 ]; then
        SCENARIO_CHECKED_CONTOURS=$((SCENARIO_CHECKED_CONTOURS + 1))
        process_scenario_contour "$feature_slug" "$feature_dir" "$FEATURE_SPECIFICATION"
      fi
    done
  fi
fi

if [ "$TRACEABILITY_MODE" -eq 1 ] && [ "$CHECKED_CONTOURS" -eq 0 ]; then
  not_established "project=$PROJECT_ROOT has no applicable project or feature contour"
fi
if [ "$COMPLETION_MODE" -eq 1 ] && [ "$COMPLETION_CHECKED_CONTOURS" -eq 0 ]; then
  mode_not_established completion "project=$PROJECT_ROOT has no applicable project or feature contour"
fi
if [ "$REPORT_REVISION_MODE" -eq 1 ] && [ "$REVISION_CHECKED_CONTOURS" -eq 0 ]; then
  mode_not_established report-revision "project=$PROJECT_ROOT has no applicable project or feature contour"
fi
if [ "$CRITERION_SCENARIOS_MODE" -eq 1 ] && [ "$SCENARIO_CHECKED_CONTOURS" -eq 0 ]; then
  mode_not_established criterion-scenarios "project=$PROJECT_ROOT has no applicable project or feature contour"
fi

TRACE_STATUS=0
if [ "$TRACEABILITY_MODE" -eq 1 ]; then
  if [ "$GAP_COUNT" -gt 0 ]; then
    printf 'VERDICT traceability=FAIL features=%s gaps=%s inconclusive=%s\n' \
      "$FEATURE_COUNT" "$GAP_COUNT" "$INCONCLUSIVE_COUNT"
    TRACE_STATUS=1
  elif [ "$INCONCLUSIVE_COUNT" -gt 0 ]; then
    printf 'VERDICT traceability=NOT-ESTABLISHED features=%s gaps=0 inconclusive=%s\n' \
      "$FEATURE_COUNT" "$INCONCLUSIVE_COUNT"
    TRACE_STATUS=2
  else
    printf 'VERDICT traceability=PASS features=%s gaps=0 inconclusive=0\n' "$FEATURE_COUNT"
  fi
fi

COMPLETION_STATUS=0
REVISION_STATUS=0
SCENARIO_STATUS=0
if [ "$COMPLETION_MODE" -eq 1 ]; then
  emit_mode_verdict completion "$COMPLETION_GAP_COUNT" "$COMPLETION_INCONCLUSIVE_COUNT"
  COMPLETION_STATUS=$?
fi
if [ "$REPORT_REVISION_MODE" -eq 1 ]; then
  emit_mode_verdict report-revision "$REVISION_GAP_COUNT" "$REVISION_INCONCLUSIVE_COUNT"
  REVISION_STATUS=$?
fi
if [ "$CRITERION_SCENARIOS_MODE" -eq 1 ]; then
  emit_mode_verdict criterion-scenarios "$SCENARIO_GAP_COUNT" "$SCENARIO_INCONCLUSIVE_COUNT"
  SCENARIO_STATUS=$?
fi

if [ "$EXPLICIT_MODE_COUNT" -le 1 ] && [ "$TRACEABILITY_MODE" -eq 1 ]; then
  exit "$TRACE_STATUS"
fi
if [ "$INCONCLUSIVE_COUNT" -gt 0 ] || [ "$COMPLETION_STATUS" -eq 2 ] || \
   [ "$REVISION_STATUS" -eq 2 ] || [ "$SCENARIO_STATUS" -eq 2 ]; then
  exit 2
fi
if [ "$TRACE_STATUS" -eq 1 ] || [ "$COMPLETION_STATUS" -eq 1 ] || \
   [ "$REVISION_STATUS" -eq 1 ] || [ "$SCENARIO_STATUS" -eq 1 ]; then
  exit 1
fi
exit 0
