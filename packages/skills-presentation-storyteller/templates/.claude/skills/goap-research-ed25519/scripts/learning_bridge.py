#!/usr/bin/env python3
"""
Self-learning bridge — health-advisor learns from its own retractions, via dz.

WHY A BRIDGE AND NOT AN ENGINE. The learning loop (`dz recall` / `dz teach`) is
SQLite FTS5 + a vector tier + embeddings, and vendoring that into a content skill pack
would be heavy for no gain. So harness-cli is an OPTIONAL, DETECTED dependency:
absent, this package behaves exactly as before and says so once; present, research
sessions start by recalling the traps already caught and end by teaching new ones.

THE TOPOLOGY: TWO STORES, ONE-WAY (ADR-004). Health lessons are WRITTEN only to
`<project>/.health-brain/.dz`. RECALL READS BOTH that store and the shared one, so the
loop still compounds — only the writes are split. Nothing copies back.

  SUPERSEDED, kept because it explains the shape of everything below (ADR-003 is amended
  rather than rewritten, and so is this). The paragraph above used to continue: "…it would
  create a SECOND store, and a loop only compounds when recall and teach hit ONE." That
  was the one-store topology, and ADR-004 replaced it after nine review rounds showed that
  keeping medical lessons in the shared store and filtering them out of each command that
  hands out lesson text is an ENUMERATION, not a guarantee — close four commands and
  review names five more. A second store is now created ON PURPOSE: a store that never
  receives the data cannot leak it from any command, including ones not yet written. The
  compounding objection was answered by making RECALL read both stores rather than by
  merging them. Do NOT "fix" this back to one store; that undoes the isolation the rest of
  this file spends its length enforcing.

WHAT IS WORTH TEACHING (the loop points — the moment a conclusion was WRONG is the
most valuable signal there is):
  * a retraction — a conclusion that had to be withdrawn;
  * a population check that flipped a conclusion;
  * a preanalytical finding that explained an alarming value;
  * closing an open question.

WHAT THIS FILE CHECKS, STATED EXACTLY.

`check_lesson` refuses IDENTIFIER FORMATS — an email, a phone number, medical-record
vocabulary followed by a value, letters against a long run of digits. Those have a
shape, and a regex is reliable about shape in any language.

It does NOT decide whether a lesson describes a method or a person. It CANNOT: that is
meaning, not shape. An earlier version of this file tried, and seven rounds of
independent cross-model review graded it F while the finding count never converged —
the proxy admitted `patient McDonald has HIV` while refusing `apoB`, and refused a
perfectly good Chinese lesson for containing "a capitalised word". Read that as the
general result it is: a pattern answering a question about meaning fails in both
directions at once.

So the judgement lives where it can be made — with the agent, via the teach protocol
in SKILL.md — and `teach` requires `--confirm-method`, which this file records and does
NOT verify. The guarantee that patient data does not travel is neither of those, and it
is not the export hold-out either: it is ADR-004. Health lessons are WRITTEN to a
separate store (`<project>/.health-brain/.dz`) and never reach the shared one; recall
reads both, nothing copies back. A store that never receives the data cannot leak it
from any command, including ones not yet written. The export hold-out remains as a
second line for stray or legacy records.

Usage (from a skill or by hand):
    python3 learning_bridge.py status
    python3 learning_bridge.py recall "transferrin saturation" [--limit 5]
    python3 learning_bridge.py check "<candidate lesson>"      # format check only
    python3 learning_bridge.py teach "<the rule>" --confirm-method
"""

from __future__ import annotations

import argparse
import json
import os
import uuid
import re
import unicodedata
import shutil
import subprocess
import sys
import fnmatch
from dataclasses import dataclass
from typing import Callable, List, Optional, Sequence, Tuple

# The domain every lesson from this package is tagged with, and the one recall boosts.
# The tag is a LABEL, not the isolation: isolation is the separate store below.
LEARNING_DOMAIN = "health-research"

# ============================================================================
# A SEPARATE STORE, WITH ONE-WAY TRANSFER (ADR-004).
#
# Health lessons are written to their OWN dz store and never to the shared one; recall
# reads BOTH. So knowledge flows engineering → medical and never the other way.
#
# WHY THIS REPLACED PER-COMMAND FILTERING. The previous design kept everything in one
# store and held the health domain out of each command that hands out lesson text. Nine
# rounds of review made the shape of that mistake unmistakable: rounds 1-7 caught me
# enumerating words and separators, rounds 8-9 caught me enumerating COMMANDS — I closed
# `--all`, `--all --stats`, `--usage` and `vector export`, and round 9 immediately
# produced `guard promote --json`, `epoch-replay --emit`, `vector harmonize`,
# `consolidate --prune-quarantine` and the `recall --forget` preview. Same defect, one
# storey up: an enumeration presented as a guarantee.
#
# A store that never receives the data cannot leak it from any command, present or
# future. That is a property of the architecture rather than of anyone's memory.
#
# THE COST, STATED. Cross-domain transfer now runs one way only. A medical insight can
# no longer surface while doing engineering work. That direction was the less valuable
# one — the traffic worth having is "a reviewer's evidence needs the same
# execute-don't-describe discipline as your own claims" arriving in a medical
# investigation — and one-way is the price of an isolation that does not depend on every
# future command remembering a rule.
HEALTH_BRAIN_DIRNAME = ".health-brain"


def health_brain(project: Optional[str] = None) -> str:
    """The project directory whose `.dz` holds health lessons. A sibling of the shared
    store, so it is obvious where the data is and trivial to inspect or delete.

    REALPATH, not abspath. `abspath` does not resolve symlinks, so `ln -s . .health-brain`
    made the "separate" store resolve to the shared one and every health lesson landed
    exactly where the design says it never goes. A separation that a symlink undoes is
    not a separation."""
    root = os.path.realpath(project or os.getcwd())
    return os.path.join(root, HEALTH_BRAIN_DIRNAME)


def _health_brain_is_distinct(project: Optional[str] = None) -> Tuple[bool, str]:
    """Refuse to write when the health brain resolves to the shared project.

    Checked at WRITE time, not only at path construction: the symlink can appear after
    the process starts, and this is the one invariant the whole design rests on."""
    root = os.path.realpath(project or os.getcwd())
    brain = health_brain(project)
    # Resolve BOTH the brain directory and the store inside it. Checking only the parent
    # missed `ln -s ../.dz .health-brain/.dz`: `.health-brain` resolved distinctly while
    # the directory dz actually writes to was the shared store. The path that matters is
    # the one that receives the data, not the one on the way to it.
    brain_literal = brain
    resolved_brain = os.path.realpath(brain)
    resolved_store = os.path.realpath(os.path.join(brain, ".dz"))
    shared_store = os.path.realpath(os.path.join(root, ".dz"))
    for label, resolved, forbidden in (
        ("the shared project", resolved_brain, root),
        ("the shared store", resolved_store, shared_store),
    ):
        if resolved.rstrip(os.sep) == forbidden.rstrip(os.sep):
            return False, (
                f"REFUSED — {HEALTH_BRAIN_DIRNAME} resolves to {label} ({forbidden}).\n"
                "  Health lessons must not land in the shared store, and a symlink here would "
                "put them there. Remove or rename it, then teach again."
            )
    # CONTAINMENT, not merely difference. Comparing against OUR project let
    # `ln -s ../../B/.dz A/.health-brain/.dz` through — B's shared store is not A's, so
    # the check passed while the lesson landed in another project's shared store, and the
    # count then grew there and confirmed "success". Asking "is the store inside the
    # brain?" is one question with one answer, instead of a list of places it must not be.
    # The brain itself must stay INSIDE our project. `A/.health-brain -> ../B` satisfied
    # containment trivially (B/.dz is inside B) while every write landed in project B's
    # ordinary shared store — the check verified the wrong pair. Two questions, not one:
    # is the brain inside our project, and is the store inside the brain.
    if os.path.commonpath([resolved_brain, root]) != root or resolved_brain == root:
        return False, (
            f"REFUSED — {HEALTH_BRAIN_DIRNAME} resolves OUTSIDE this project "
            f"({resolved_brain}).\n"
            "  A symlink here sends health lessons into another project's store, where "
            "they look like an ordinary success. Remove or rename it, then teach again."
        )
    # …and the brain must not BE another project. `/A/.health-brain -> /A/subproject`
    # satisfied both containment checks (it sits inside A, and its .dz sits inside it)
    # while every lesson landed in the subproject's ORDINARY shared store — and the
    # canary, found through the same alias, certified it. Containment says where a path
    # sits; it cannot say what the directory IS. A directory that already holds a dz
    # store is somebody else's project, whatever its path.
    if resolved_brain != brain_literal and os.path.isdir(os.path.join(resolved_store, "memory")):
        return False, (
            f"REFUSED — {HEALTH_BRAIN_DIRNAME} resolves to {resolved_brain}, which already "
            "holds a dz store of its own.\n"
            "  That is another project's shared store, not this brain: health lessons "
            "would land there and look like an ordinary success. Remove or rename the link."
        )
    if os.path.commonpath([resolved_store, resolved_brain]) != resolved_brain:
        return False, (
            f"REFUSED — {HEALTH_BRAIN_DIRNAME}/.dz resolves OUTSIDE the brain "
            f"({resolved_store}).\n"
            "  A symlink here sends health lessons into someone else's store, where they "
            "look like an ordinary success. Remove or rename it, then teach again."
        )
    return True, brain

# THE WIRE CONTRACT between this bridge and `dz recall --domain`.
#
# The CURRENT dz ends its domain run with one of two note lines; their ABSENCE is how
# an older CLI is detected (see recall() for why an exit code cannot do that job).
#
# Round 2 broke the first version of this: the marker was the bare substring `domain "`,
# which any RECALLED LESSON could contain — `remember domain "ownership" before
# reporting` would have certified an old CLI as boost-capable. A capability probe that
# the payload can forge is not a probe. So the check is now anchored to the START of a
# line AND requires one of the two full tails the renderer emits.
#
# These strings are pinned on the other side too: a harness-core test asserts
# renderDomainBoostNote() still emits them, so changing the wording turns that test red
# instead of silently switching this loop into permanent degraded mode.
BOOST_NOTE_TAILS = (
    "foreign-domain lessons kept (a boost, not a filter)",
    "order unchanged, nothing was hidden",
)


def _boost_note_present(out: str, domain: str = LEARNING_DOMAIN) -> bool:
    """True when THIS dz printed a real domain-boost note (not a lesson quoting one)."""
    head = f'domain "{domain}":'
    # split("\n"), NOT splitlines(). Python's splitlines() also breaks on U+2028,
    # U+0085 and friends, which the CLI does not treat as line breaks — so a lesson
    # containing one produced a "line" the renderer never emitted, and that forged line
    # could satisfy this probe. Splitting exactly the way the producer joins keeps a
    # forged tail stuck on a line that starts with the hit prefix, where the anchor
    # below rejects it.
    for line in out.split("\n"):
        stripped = line.strip()
        if stripped.startswith(head) and any(tail in stripped for tail in BOOST_NOTE_TAILS):
            return True
    return False

DZ_MISSING_NOTE = (
    "self-learning is OFF: `dz` (@dzhechkov/harness-cli) is not installed. "
    "The package works exactly as before; install it to let research sessions recall "
    "the traps already caught and record new ones: npm i -g @dzhechkov/harness-cli"
)

# --------------------------------------------------------- shape check (narrow)

# =============================================================================
# WHAT THIS CHECK IS, AND WHAT IT DELIBERATELY IS NOT.
#
# It is NOT a privacy guard. An earlier version of this file tried to be one: it
# decided, from the text alone, whether a lesson described a METHOD or a PERSON.
# Seven rounds of independent cross-model review graded that design F, and the
# finding count never converged (11, 10, 5, 3, 6, 6, 8). Four of the rounds found the
# same CLASS of defect, because the design was wrong rather than incomplete:
#
#   "is this a method or a record about a person?" is a question about MEANING,
#   and every pattern that answers it is a proxy — so it fails in BOTH directions.
#
# The proof, from one round: the predicate "two or more capitals is an acronym"
# admitted `patient McDonald has HIV` and refused `apoB` — the very example this
# skill's own documentation offered as correct. Another round refused a legitimate
# Chinese method lesson with the message "a capitalised word", which is meaningless
# for Han script. And no pattern in any language sees the case that matters most:
# `the patient with situs inversus who ran a marathon` carries no name and no digit
# and identifies exactly one human being on earth.
#
# So the work is split by NATURE, and each part sits where it can actually be done:
#
#   * FORMAT (here) — email, phone, record numbers, long digit runs. Closed classes
#     with a shape. A regex is genuinely reliable on these, in every language.
#   * MEANING (SKILL.md) — "is this a method?", quasi-identifiers. Judged by the
#     agent already in the loop, which is a language model; asking a subprocess to
#     answer what its own caller answers better was the original absurdity.
#   * THE SEPARATION (ADR-004) — health lessons are written to their OWN store and
#     never to the shared one. A store that never receives the data cannot hand it out
#     from any command, including ones not yet written. The domain hold-out on the
#     portable export REMAINS, but as a second line for stray or legacy records — not
#     as the promise. Filtering each command that emits lesson text was itself an
#     enumeration, and review produced five more surfaces the moment four were closed.
#     THE GUARANTEE IS ADR-004: health lessons are written to a SEPARATE store and never
#     reach the shared one. The hold-out is the second line, not the promise.
#
# Nothing here claims to detect personal data. It cannot, and saying otherwise was
# the actual defect.
# =============================================================================

def _luhn_ok(digits: str) -> bool:
    """The Luhn (mod-10) check digit, ISO/IEC 7812. Card numbers carry it; an allocation
    or a dilution series written in the same four-by-four shape almost never does."""
    total = 0
    for index, char in enumerate(reversed(digits)):
        value = int(char)
        if index % 2 == 1:
            value *= 2
            if value > 9:
                value -= 9
        total += value
    return total % 10 == 0


def _is_card_number(match: "re.Match") -> bool:
    """SHAPE alone cannot separate `4111 1111 1111 1111` from `1000-1000-1000-1000` —
    both are four groups of four, and round 17 was right that the second is an ordinary
    allocation across trial arms. The discriminator is not a longer list of shapes: it is
    the OUTCOME of the check digit the card format specifies. MEASURED: 4111111111111111
    satisfies Luhn, 1000100010001000 does not.

    Stated limit: a card number embedded in a LONGER run of groups (five or more) is not
    detected, because the checksum is computed over the whole matched run rather than over
    every window inside it. Sliding a window would trade one honest miss for a family of
    false alarms on long numeric tables."""
    digits = re.sub(r"\D", "", match.group(0))
    # ISO/IEC 7812 puts a primary account number at 12-19 digits. Outside that range a
    # Luhn hit is coincidence, not a card.
    return 12 <= len(digits) <= 19 and _luhn_ok(digits)


# The value that follows medical-record vocabulary: how it was INTRODUCED decides how
# much shape it needs. See _is_record_identifier.
_RECORD_VOCABULARY = (
    r"(?:mrn|снилс|полис|истори\w*[\s-]+болезни"
    r"|medical[\s-]+record[\s-]+(?:no|number)|record[\s-]+no)"
)


def _is_record_identifier(match: "re.Match") -> bool:
    """Is the text after the vocabulary a VALUE, or is it prose that happens to contain a
    number?

    The honest distinction is HOW THE VALUE WAS INTRODUCED, not how long it is:

      * A SEPARATOR introduces a value directly — `MRN: 7`, `MRN № 84729163`,
        `MRN = 84729163`. After a separator the author has already said "a value follows",
        so anything carrying a digit counts, however short. Round 16's fix required the
        value to LOOK like an identifier (3+ digits, or letters and digits mixed) and so
        let `MRN: 7` through; length was never the point.
      * WITHOUT a separator only the token IMMEDIATELY after the label (whitespace and an
        `is`/`are`/`no.` copula aside) can be the value, and it must still look like an
        identifier. That is what keeps `compare medical record number in 3 hospitals` and
        `medical record number use in 300 hospitals` out: the digit is reached across
        PROSE WORDS, and prose is not a value however near it sits.

    The separator class is "not a letter, digit, underscore or space" — a complement, so
    there is no list to fall behind, which is the mistake rounds 13-16 kept finding.

    Stated limit: a sentence-ending period is a separator too, so `audit the MRN. 3 wards`
    is refused. Over-refusing an ambiguous sentence is the direction this rule should err
    in, and it is named here rather than papered over."""
    gap = match.group("gap")
    value = match.group("value")
    # The NUMERO marker introduces a value as directly as `#` does — it is the same
    # word. It has to be named because NFKC folds `№` to the two letters `No`, so by the
    # time this rule sees `MRN № 7` the separator has become part of the prose: the
    # normalisation that stops `MRN‑ 7` from evading the check also hides this one.
    introduced = (any(not (ch.isalnum() or ch == "_" or ch.isspace()) for ch in gap)
                  or re.search(r"\bno\.?\b", gap, flags=re.IGNORECASE) is not None)
    if not introduced:
        tokens = value.split()
        value = tokens[0] if tokens else ""
    if not _has_digit(value):
        return False
    if introduced:
        return True
    # …reached across whitespace only: it must look like an identifier rather than a count.
    return bool(re.search(r"\d{3,}|[^\W\d_][^\w\s]?\d|\d[^\w\s]?[^\W\d_]", value))


# Direct identifiers: a FORMAT, not a meaning. These stay blocking — no method lesson
# needs one, and no confirmation flag should be able to wave one through.
# (pattern, why, ignore_case, validator) — the flag is PER PATTERN and that is
# load-bearing. A blanket re.IGNORECASE made the accession rule's `[A-ZА-Я]{2,}` match
# lower case too, so `a cohort of 123456789 people` was refused as an accession. An
# earlier round taught exactly this lesson about a different pattern; the rewrite dropped
# it and it came back.
#
# The VALIDATOR is the round-17 addition and it is the point: where a shape is genuinely
# ambiguous, a regex that decides alone must either over-refuse method prose or under-
# refuse identifiers. A validator lets the rule decide by OUTCOME (does the check digit
# hold?) or by STRUCTURE (was the value introduced by a separator, or reached across
# prose?) instead of by a longer list of shapes. It is `None` where the pattern alone is
# the whole rule.
_IDENTIFIER_PATTERNS: Sequence[Tuple[str, str, bool, Optional[Callable[["re.Match"], bool]]]] = (
    # An email, including the quoted local part RFC 5321 allows.
    # The quoted local part may itself contain `@` — `"john@doe"@example.com` is a legal
    # address and the first version's own comment claimed to cover quoted forms.
    # The domain may be an IP LITERAL — `"john"@[192.0.2.1]` is a legal address and the
    # dotted-name branch never saw it.
    # The domain may be a bare host (`user@localhost`) or an IP literal, and the quoted
    # local part may contain an escaped quote. Requiring a dot in the domain missed the
    # first; the earlier quoted-form comment promised more than the pattern delivered.
    # The local part may use ANY RFC dot-atom character, not the hand-picked four:
    # `customer!@localhost` is a legal address and walked past the class below.
    # The DOMAIN must be a real domain: a dotted name, an IP literal, or exactly
    # `localhost`. The bare-host branch was added for `user@localhost` and it swallowed
    # every `<word>@<word>` in ordinary prose — `apoB@baseline` and `apoB@week12` are how
    # a study writes its endpoints, and they were read as email addresses. `localhost` is
    # not a list of hosts: it is the one name RFC 6761 reserves, which is why the branch
    # existed at all. `customer!@localhost` stays refused.
    (r'''(?:"(?:[^"\\]|\\.)+"|[\w.!#$%&'*+/=?^`{|}~-]+)@'''
     r'''(?:\[[^\]]+\]|[\w-]+(?:\.[\w-]+)+|localhost(?![\w-]))''',
     "an email address", True, None),
    # A UUID and the 3-2-4 national-identifier grouping. A pattern for a CLOSED, SPECIFIED
    # format is NOT the enumeration this file keeps being caught at: the names and words
    # rounds 1-16 enumerated form an open set that grows with every language and every
    # reviewer, while RFC 4122's 8-4-4-4-12 hex and the 3-2-4 shape are fixed by a
    # standard and do not grow at all. Writing down a closed format is describing it;
    # writing down "the identifiers I thought of" is guessing at the next member.
    (r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
     "a UUID — a specified identifier format", True, None),
    (r"(?<![\d-])\d{3}-\d{2}-\d{4}(?![\d-])",
     "the 3-2-4 grouping of a national identifier", False, None),
    # A phone number needs a country prefix OR THREE OR MORE digit groups. Two groups
    # was the wrong bound in both directions: it refused `sample 500-1000 records` and
    # `compare 100/1000 bootstrap samples` — ordinary ranges — while `555-1234` is the
    # SAME SHAPE as a range and cannot be told apart from one. So a bare two-group form
    # is deliberately allowed through and that limit is stated rather than papered over;
    # grouped card numbers (4111 1111 1111 1111) are four groups and still caught.
    # Every group at least three digits. `1000-100-10` (a dilution series) has a
    # two-digit group and is not a phone; `555-123-4567` and `4111 1111 1111 1111` are.
    # The country-prefix branch needs the same "groups of 3+" rule as the other one, or
    # `+1 / 2 / 3 / 4` (concentration steps) reads as a phone number.
    # After a `+`, what separates a phone from `+1 / 2 / 3 / 4` (concentration steps) is
    # the TOTAL number of digits, not the size of each group: `+44/20/7946/0958` has
    # two-digit groups and is plainly a phone. So the prefix branch counts (7 or more,
    # the shortest real international number) and the unprefixed branch keeps the
    # groups-of-three rule that lets `1000-100-10` through.
    # The `+` may be followed by a SEPARATOR before the first digit: `+ (44) 20 7946 0958`
    # is how the number is written on a business card, and requiring a digit immediately
    # after the plus let it through.
    (r"\+[\s()./-]*(?=(?:[\d\s()./-]*\d){7,})\d[\d\s()./-]{4,}\d",
     "something shaped like a phone number", True, None),
    # Four or more groups is a phone whatever their size — `01 42 68 53 00` is the
    # French format and has five two-digit groups. Three groups still need 3+ digits
    # each, which keeps `1000-100-10` (a dilution series) out.
    # NO branch for runs of two-digit groups. `01 42 68 53 00` (a French phone) and
    # `10 20 30 40 50 weeks` (a time course) are the SAME shape, and two attempts to
    # separate them both failed: a unit LIST missed `weeks`, and inverting it to "any
    # following word" matched `before`. So neither is classified, exactly as with
    # `555-1234` against `500-1000` and `NCT 04368728` against `PCR 100000`.
    # THREE groups of three is undecidable too: `1000-1000-1000` is a dilution series
    # and `555-123-4567` a phone, and nothing in the shape tells them apart — the same
    # verdict already reached for `555-1234` vs `500-1000`. Four groups is card-shaped…
    # …but four groups of four is ALSO how `1000-1000-1000-1000` participants are split
    # across trial arms, so the shape is where the rule STARTS, not where it decides.
    # _is_card_number finishes it with the format's own check digit.
    (r"\b\d{3,}(?:[\s.()/-]+\d{3,}){3,}",
     "a card number — its Luhn check digit holds", True, _is_card_number),
    # A LABEL decides what an otherwise-undecidable digit run is. `phone: 5551234567`
    # says what it is in words, so no shape heuristic is needed — the same move the
    # medical-record rule makes. This is how the shapes that are genuinely ambiguous on
    # their own still get caught: the author's own label does the deciding.
    (r"\b(phone|tel|telephone|mobile|cell|fax|факс|телефон|моб\w*)\b[^\w]{0,3}"
     r"(?=[\d\s()./+-]{6,}\d)[\d\s()./+-]{6,}\d",
     "a labelled phone number", True, None),
    # Medical-record vocabulary, but only when a VALUE follows: the phrase alone
    # ("audit medical record number quality") is ordinary method prose.
    (r"\b" + _RECORD_VOCABULARY + r"\b"
     # The value may be introduced by any punctuation or copula, not just `:` and `#`:
     # `MRN № 84729163`, `MRN = 84729163` and `medical record number is 84729163` all
     # walked past a hand-picked separator class.
     # A COMMA introduces the value as readily as a colon does: `MRN, 84729163`.
     # Any punctuation may introduce the value — period, semicolon, slash and comma all
     # appeared in review. The class is now "not a letter or digit", which has no list to
     # fall behind.
     # Any run of NON-WORD characters may sit between the vocabulary and the value —
     # spaces and punctuation in any order (` / `, `. `, `; `, `, `, ` № `). Ordering the
     # two classes was itself a small enumeration, and ` / ` walked between them.
     # The value may itself contain a space: `MRN: AB 1234`. Requiring the whole value to
     # fit ONE [\w-]+ token let the labelled identifier through because `AB` carries no
     # digit. Accept up to three tokens after the label and require a digit among them.
     # The value may carry punctuation inside it: `MRN: AB/1234`. Restricting it to
     # word/space/hyphen characters let a slash split the label from its own value.
     # …and the value is COMPACT: the digit must appear within ~10 characters of the
     # label. `AB 1234` and `AB/1234` qualify; `completeness across 3 hospitals` is prose
     # whose digit sits far away, and the distance is what separates them. Requiring the
     # digit in the FIRST token was too strict (it broke `MRN: AB 1234`), requiring it
     # anywhere was too loose — the reach is the honest middle.
     # …and the value must LOOK like an identifier: three or more digits, or letters and
     # digits mixed. `compare medical record number in 3 hospitals` put a lone `3` inside
     # the reach window, so nearness alone was not enough — a record number is not a
     # one-digit count.
     # ROUND 17 replaced the "~10 characters of reach" window with a captured GAP and a
     # captured VALUE, judged by _is_record_identifier. The window measured DISTANCE IN
     # CHARACTERS, which cannot see the difference between `MRN: 7` (a value, one
     # character away, admitted) and `medical record number use in 300 hospitals` (prose,
     # ten characters away, refused). Both errors were the same mistake: counting
     # characters instead of asking what introduced the value.
     r"(?P<gap>[^\w]*(?:(?:is|are|no\.?)\b[^\w]*)*)"
     r"(?P<value>[\w-]+(?:[^\w\s]+[\w-]+)*(?:[ \t][\w-]+(?:[^\w\s]+[\w-]+)*){0,2})",
     "a medical-record identifier", True, _is_record_identifier),
    # Letters against a long digit run, in either order and however punctuated.
    # Letters against a long digit run, in either order — but NOT when the digits are part
    # of a HYPHENATED COMPOUND MODIFIER. `100000-fold` and `ISO15189-compliant` are the
    # same construction: the digits belong to a word that describes something, not to a
    # record about somebody. Round 16 spelled this exception as the unit list
    # `-?fold|x\b|×`, which is an enumeration wearing an allowlist's clothes — round 17
    # produced `ISO15189-compliant` immediately, exactly as rounds 13-16 produced the next
    # `.gitignore` variant and the next unit word. The STRUCTURE that made `fold` special
    # is the hyphen joining digits to a following word, so that is what the rule now says,
    # in both directions (the second branch simply stops treating `-` as an in-token
    # joiner). `×` keeps its own exclusion because it is multiplication notation, not a
    # word.
    # Stated limit: an identifier that is itself hyphenated into a word — `AB1234567-linked`
    # — is not caught. That miss is the price of not maintaining a list of unit words, and
    # a list is what review has refuted four times.
    # A SINGLE leading letter counts: `A12345678` is a code, and requiring two letters
    # was a bound with nothing behind it. `x`/`X` is excluded as the multiplication prefix
    # (`x100000`), for the same reason `×` is.
    (r"(?:[^\W\d_]{2,}|(?![xX])[^\W\d_])[^\w\s<>=≥≤~±×]*_*\d{5,}(?!-[^\W\d_])"
     r"|(?<![×x])\d{5,}_*[^\w\s<>=≥≤~±×-]*[^\W\d_]{2,}",
     "letters against a long run of digits — an identifier, however it is punctuated",
     True, None),
    # NO space-separated accession rule. It was added to catch `NCT 04368728` and it
    # refused `PCR 100000 reads per sample should trigger contamination review` — an
    # ordinary method lesson. The two are the SAME SHAPE: an upper-case token, a space, a
    # long number. Like `555-1234` against `500-1000`, shape cannot separate them, so
    # neither is classified and the limit is stated instead of guessed at. `MRN 84729163`
    # is still caught, by the medical-record vocabulary rule above, which keys on meaning
    # the standard gives those words rather than on the shape around them.
)


def _has_digit(text: str) -> bool:
    """One predicate for "digit", used everywhere. `isdigit` alone misses `²` and `Ⅻ`;
    a round found the two halves of this file disagreeing about the word."""
    return any(ch.isdigit() or ch.isnumeric() for ch in text)


@dataclass(frozen=True)
class LessonVerdict:
    ok: bool
    blockers: List[str]
    notices: List[str]

    @property
    def note(self) -> str:
        lines: List[str] = []
        if self.blockers:
            lines.append("REFUSED — this carries an identifier, which no lesson needs:")
            lines += [f"  - {b}" for b in self.blockers]
        for n in self.notices:
            lines.append(f"  NOTICED: {n}")
        if self.ok:
            lines.append(
                "  No identifier FORMAT found. That is all this check can tell you: it does not "
                "know whether the sentence describes a method or a person. You do — see the teach "
                "protocol in SKILL.md."
            )
        return "\n".join(lines)


# Unicode has a whole block of dash-like characters and NFKC does NOT collapse them to
# ASCII: U+2011 (non-breaking hyphen) folds to U+2010, still not `-`. So `medical‑record
# number 84729163` slipped a vocabulary pattern spelled with an ASCII hyphen. Folding the
# dashes explicitly means the patterns can be written once, in ASCII, instead of every
# pattern carrying its own dash class.
def _fold(text: str) -> str:
    """One canonical form for matching: compatibility-normalised, every dash ASCII.

    Dashes are folded by Unicode CATEGORY (`Pd`), not by a table of the ones I happened
    to think of — review walked U+058A and U+2E3A through a hand-written list, which is
    the enumeration mistake this whole feature has been unlearning. `Pd` is the closed
    set the standard maintains."""
    folded = unicodedata.normalize("NFKC", text)
    return "".join("-" if unicodedata.category(ch) == "Pd" else ch for ch in folded)


def check_lesson(text: str) -> LessonVerdict:
    """Refuse formatted identifiers; observe the rest out loud; judge nothing.

    The judgement this file used to attempt now lives in SKILL.md, addressed to the
    agent — which can read meaning, and which is already running.
    """
    # NFKC FIRST. Review walked `555‑1234` and `medical‑record number 84729163` through
    # by using U+2011 (non-breaking hyphen) where the patterns expected ASCII, and a
    # fullwidth spelling defeats every character class the same way. Compatibility
    # normalisation folds those presentation variants onto the characters they stand for,
    # so the patterns match one canonical form instead of chasing separators.
    raw = _fold(text or "")
    if not raw.strip():
        return LessonVerdict(False, ["the lesson is empty"], [])
    blockers: List[str] = []
    for pattern, why, ignore_case, validator in _IDENTIFIER_PATTERNS:
        flags = re.UNICODE | (re.IGNORECASE if ignore_case else 0)
        # finditer, not search: a validator may reject the FIRST match while a later one
        # in the same lesson is a real identifier. Stopping at the first candidate would
        # make the check depend on where in the sentence the decoy sits.
        for match in re.finditer(pattern, raw, flags=flags):
            if validator is None or validator(match):
                blockers.append(why)
                break
    notices: List[str] = []
    if _has_digit(raw):
        notices.append(
            "the lesson contains a number — is it knowledge (a guideline threshold) or a "
            "reading from one person? Only the second is a problem, and only you can tell"
        )
    return LessonVerdict(not blockers, blockers, notices)


# ---------------------------------------------------------------- dz detection

def dz_path() -> Optional[str]:
    """Absolute path to `dz`, or None. Detection only — never installs anything."""
    return shutil.which("dz")


def _run_dz(args: Sequence[str], timeout: int = 60) -> Tuple[int, str, str]:
    exe = dz_path()
    if exe is None:
        return 127, "", DZ_MISSING_NOTE
    try:
        proc = subprocess.run([exe, *args], capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.SubprocessError) as exc:
        return 1, "", f"dz call failed: {exc}"
    return proc.returncode, proc.stdout, proc.stderr


def status() -> str:
    exe = dz_path()
    if exe is None:
        return DZ_MISSING_NOTE
    code, out, _ = _run_dz(["recall", "--all", "--stats"], timeout=90)
    if code != 0:
        return f"dz found at {exe}, but the learned store is not readable yet — teach the first lesson to create it."
    total = out.splitlines()[0] if out else ""
    brain = health_brain()
    # --include-domain, for the same reason _brain_count needs it: `recall --all` applies
    # the export hold-out and would report an occupied health brain as empty. The fix was
    # made in _brain_count and NOT carried to its neighbour — a fix applied to one call
    # site is not a fix.
    hcode, hout, _ = _run_dz(["recall", "--all", "--stats", "--project", brain,
                              "--include-domain", LEARNING_DOMAIN], timeout=90)
    htotal = (hout.splitlines()[0] if hout else "").strip() if hcode == 0 else "not created yet"
    return (
        f"self-learning ON via {exe}\n"
        f"  health brain  {brain}\n    {htotal}\n"
        f"  shared brain  {total.strip()}\n"
        f"  lessons from this package are WRITTEN ONLY to the health brain (domain={LEARNING_DOMAIN});\n"
        f"  recall reads both, so engineering lessons transfer in and medical ones never leave"
    )


def recall(query: str, limit: int = 5) -> str:
    """Recall traps already caught. Absent dz is a NOTE, never a failure — a research
    session must not depend on an optional dependency.

    TWO calls, one per store (health first, then shared), and no retry — an earlier version of this docstring
    promised a fallback call that the code never made (round 2 caught the prose, not
    the code, lying). No retry is needed: an older `dz` does not REJECT `--domain`, it
    ignores the flag and exits 0 with unranked results, so the single call already
    returns everything an unflagged one would. What the older CLI cannot do is print
    the boost note — which is why detection reads the OUTPUT, not the exit code.

    A non-zero exit is a different thing entirely and is reported as itself: recall is
    unavailable and the session proceeds WITHOUT prior lessons. It is never reported as
    "your CLI is old", because that would be a guess about the cause.
    """
    if query.startswith("--"):
        # ARGUMENT injection, not shell injection: the query lands in argv, and a leading
        # `--` makes the child parser read it as an option — recall("--all") would dump
        # the entire learned store. Shell quoting does not help; this does.
        #
        # Only `--` is refused, not a single dash. Round 2 measured that `dz` treats
        # `-contrast` as an ordinary positional argument, so refusing it blocked
        # legitimate text ("-contrast", "-negative findings") to defend against nothing.
        # A guard that refuses safe input teaches people to work around the guard.
        return "refusing a query that starts with '--': it would be read as an option by dz, not as text"

    # BOTH stores, in one direction: the health brain first (its lessons are the ones
    # about this work), then the shared brain for cross-domain transfer. Nothing here
    # writes; `teach` only ever touches the health brain, which is what makes the flow
    # one-way rather than a convention someone has to remember.
    brain = health_brain()
    parts: List[str] = []
    code, out_health, err = _run_dz(["recall", query, "--domain", LEARNING_DOMAIN,
                                     "--limit", str(limit), "--project", brain])
    if code == 127:
        return err
    if code == 0 and out_health.strip():
        parts.append("— health brain —\n" + out_health.rstrip())

    shared_code, shared_out, shared_err = _run_dz(["recall", query, "--limit", str(limit)])
    if shared_code == 0 and shared_out.strip():
        parts.append("— shared brain (engineering lessons transfer INTO this work; "
                     "medical lessons never leave the health brain) —\n" + shared_out.rstrip())

    # EACH failure is named. Reporting only when BOTH stores fail swallowed a corrupt
    # health store whenever the shared one answered — and worse, the missing health
    # section then fell through to the "your CLI predates --domain" branch, which is a
    # diagnosis of the wrong thing. A partial loop must say which half is missing.
    if code != 0:
        parts.append(f"— health brain UNAVAILABLE ({err.strip() or 'unknown error'}) — "
                     "its lessons are NOT in this result —")
    if shared_code != 0:
        parts.append(f"— shared brain unavailable ({shared_err.strip() or 'unknown error'}) — "
                     "cross-domain transfer is NOT in this result —")
    if code != 0 and shared_code != 0:
        return f"recall unavailable ({err.strip() or shared_err.strip() or 'unknown error'}) — proceeding WITHOUT prior lessons"
    if not parts:
        return "no prior lessons matched — this is new ground"
    out = "\n".join(parts)

    # CAPABILITY, not exit code (Codex QE #3 — the sharpest finding of the round).
    # The PREVIOUS dz did not reject `--domain`: its parser accepted any `--key value`
    # and cmdRecall simply ignored it, exiting 0 with UNFILTERED results. So an
    # error-code test could never fire, and my own test had FABRICATED the failure it
    # was checking — modelling a version that never existed. The observable difference
    # is the boost note the new CLI prints; its absence is what "too old" looks like.
    # Judge the capability on the HEALTH call's output only, and only when that call
    # SUCCEEDED. `--domain` is passed to that call alone, so checking the merged text
    # meant a failed health store produced a missing note and the code then blamed an
    # old CLI — a confident diagnosis of the wrong thing, which is worse than silence.
    if code == 0 and not _boost_note_present(out_health):
        return out.rstrip() + (
            "\n  note: this dz ranked WITHOUT the domain boost (the installed CLI predates "
            "`dz recall --domain`, which ignores the flag silently rather than failing) — results "
            "may mix other domains. Upgrade: npm i -g @dzhechkov/harness-cli"
        )
    return out.rstrip() or "no prior lessons matched — this is new ground"


# The paths inside the brain whose fate the ignore file decides. `.dz` alone is not
# enough: a rule may leave the directory ignored and still re-expose what is under it.
_PROTECTED_PATHS = (".dz", ".dz/memory", ".dz/memory/patterns.jsonl")


def _gitignore_rule_matches(rule: str, path: str) -> bool:
    """Does one gitignore rule MATCH this path, by git's matching rules?"""
    rule = rule.rstrip("/")            # a trailing `/` means "directories only"
    if not rule:
        return False
    if rule.startswith("/"):
        rule, anchored = rule[1:], True
    else:
        anchored = "/" in rule
    if anchored:
        # Anchored to the directory holding the ignore file: match the whole path, and
        # also anything beneath a directory the rule names.
        return fnmatch.fnmatch(path, rule) or fnmatch.fnmatch(path, rule + "/*")
    # No slash: git matches the pattern against the BASENAME at any depth. Matching any
    # component also covers "an ancestor directory is (un)ignored", which is the case
    # `!.dz/` exploits.
    return any(fnmatch.fnmatch(part, rule) for part in path.split("/"))


def _gitignore_ignores(text: str, path: str) -> bool:
    """Is `path` ignored, applying the rules the way git does: LAST MATCHING RULE WINS.

    WHAT THIS DOES NOT MODEL, stated rather than implied:
      * `**` is approximated — fnmatch's `*` already crosses `/`, so `a/**/b` is looser
        here than in git, and `**` never matches "zero directories" specially;
      * bracket expressions (`[a-z]`) and backslash escapes are left to fnmatch, whose
        dialect is close to git's but not identical;
      * "directories only" (a trailing `/`) is accepted but not ENFORCED — this function
        is given path strings, not a filesystem, so it cannot ask whether a path is a
        directory. The effect is to treat such a rule as matching slightly more, which
        errs toward refusing;
      * rules from OUTSIDE this file — a parent `.gitignore`, `.git/info/exclude`,
        `core.excludesFile` — are not consulted, so a parent may still un-ignore what
        this file ignores;
      * a file already TRACKED by git is never ignored, whatever any rule says. That is a
        property of the index, not of the rules, and no reading of this file can see it.
    Each of those makes the answer approximate in a direction that is either safe or
    named; none of them is the round-16 defect, which was applying the wrong rule
    entirely."""
    ignored = False
    for line in text.splitlines():
        rule = line.strip()
        if not rule or rule.startswith("#"):
            continue
        negated = rule.startswith("!")
        if negated:
            rule = rule[1:]
        if _gitignore_rule_matches(rule, path):
            ignored = not negated
    return ignored


def _protect_brain(brain: str) -> None:
    """Create the health brain and make it SELF-IGNORING for git.

    A `.gitignore` holding `*` INSIDE the directory ignores everything in it, including
    itself, without touching the user's own ignore file. That matters: the monorepo rule
    that protected this during development ships with nothing — a consumer who installs
    the package gets a plaintext medical store one `git add -A` away from a push, and the
    ADR promised protection from exactly that.

    Self-contained beats editing someone else's `.gitignore`: it needs no cooperation
    from the project, survives the file being rewritten, and travels with the directory
    if it is moved. Written only when absent, so a deliberate change is never clobbered.
    """
    os.makedirs(brain, exist_ok=True)
    marker = os.path.join(brain, ".gitignore")
    # PRESENCE IS NOT VALIDITY. `os.path.exists` accepted a DIRECTORY named `.gitignore`
    # as a satisfied rule, so the protection read as present while git ignored nothing —
    # found by the test written for the OSError case, which is the argument for writing
    # the test rather than reasoning about the code.
    # A SYMLINK is not a rule git will read. Git does not follow `.gitignore` symlinks in
    # the working tree, so a link pointing at a file containing `*` satisfied `isfile()`
    # and `open()` while git ignored nothing — the check saw a rule git never sees. Third
    # variant of the same defect: first a directory, then an empty file, now a link.
    # `islink` is asked FIRST because it is the only question `isfile` cannot answer.
    if os.path.islink(marker):
        raise RuntimeError(
            f"{marker} is a SYMLINK. Git does not follow a symlinked .gitignore, so the "
            "rule it points at would never apply and this store would be staged by a "
            "routine `git add -A`. Replace it with a regular file containing `*`."
        )
    if os.path.exists(marker) and not os.path.isfile(marker):
        raise RuntimeError(
            f"{marker} exists but is not a file, so it cannot hold the ignore rule. "
            "Refusing to write health lessons into a directory that a routine "
            "`git add -A` would stage."
        )
    # A FILE is not a RULE. An empty (or unrelated) .gitignore satisfied `isfile` while
    # ignoring nothing — the previous fix closed the "directory" case and left the case
    # that actually happens: a pre-existing or hand-edited file. Presence is not validity,
    # one level up from where I fixed it last time.
    if os.path.isfile(marker):
        try:
            existing = open(marker, encoding="utf-8").read()
        except OSError as exc:
            raise RuntimeError(
                f"cannot read the ignore rule at {marker} ({exc}), so it cannot be "
                "verified. Refusing to write health lessons into a directory whose "
                "protection is unknown."
            ) from exc
        # LAST MATCH WINS, exactly as git resolves it — AGAINST A SPECIFIC PATH.
        # Round 16 read "last match wins" as "any later `!` cancels the `*`", which is a
        # different rule and a wrong one: it refused
        #     *
        #     !README.md
        # a file that ignores the store perfectly well, because `!README.md` never matches
        # `.dz` and so never becomes the last MATCHING rule. One wrong model replaced
        # another. _gitignore_ignores evaluates the rules the way git does, per path.
        if not all(_gitignore_ignores(existing, path) for path in _PROTECTED_PATHS):
            raise RuntimeError(
                f"{marker} does not ignore this directory IN FORCE: git applies the LAST "
                "rule that MATCHES a path, and for at least one of "
                f"{', '.join(_PROTECTED_PATHS)} that rule is either absent or a `!` "
                "negation that re-exposes the store. A routine `git add -A` would stage "
                "it. Leave a plain `*` last, or delete the file so it can be recreated."
            )
    if not os.path.isfile(marker):
        try:
            with open(marker, "w", encoding="utf-8") as handle:
                handle.write(
                    "# The health brain holds lessons drawn from one person's medical\n"
                    "# investigations. `*` ignores everything here, including this file, so a\n"
                    "# routine `git add -A` cannot stage it. Delete this line only if you mean\n"
                    "# to commit medical data.\n*\n"
                )
        except OSError as exc:
            # NOT best-effort. ADR-004 promises protection from a routine `git add -A`,
            # and a swallowed failure here leaves a plaintext medical store staged by the
            # next one while the write reports success — a promise kept in prose only.
            raise RuntimeError(
                f"cannot create the ignore rule at {marker} ({exc}). Refusing to write "
                "health lessons into a directory that a routine `git add -A` would stage."
            ) from exc


# A harmless probe written BEFORE the real lesson, to prove `--project` is honoured.
# It carries no medical content by construction, so if the older-CLI defect fires, what
# lands in the shared store is this self-describing string and not a patient's finding.
_CANARY_TEXT = "health brain routing self-test — safe to delete"


def _project_write_lands(brain: str, project: Optional[str] = None) -> Tuple[bool, str]:
    """Prove the write goes where we asked, BEFORE writing the real lesson.

    The previous design counted before and after the REAL write, so an older CLI (which
    accepts `--project` and writes from the current directory anyway, returning 0) was
    detected only once the lesson was already in the shared store — the check returned
    failure about a leak it had just permitted. "Fails closed" described the return
    status, not the mutation.

    A canary moves the cost of that detection onto a meaningless string. If it does not
    land, the real lesson is never written and the caller is told exactly what to look
    for in the shared store.

    TWO QUESTIONS, NOT ONE (round 17). Presence in the brain was the whole test, and
    presence was checked THROUGH THE BRAIN PATH — so any alias that makes the brain path
    and the shared path reach the same store certified that store as the brain. The
    layout that proved it: `.health-brain` and `.health-brain/.dz` are real directories
    while `.health-brain/.dz/memory` is a symlink to `../../.dz/memory`. Every path check
    in _health_brain_is_distinct resolves the brain and its `.dz`, both of which are
    genuinely distinct; the aliasing lives one level DEEPER, where dz actually keeps the
    data. The canary, its lookup, both counts and the real teach then travelled the same
    alias, and the bridge reported "recorded in the health brain" about a lesson sitting
    in the shared one — the exact thing ADR-004 exists to prevent.

    The answer is not another path-shape check. A path check can only refuse the shapes
    it was told about, and this file's whole history is review producing the next shape:
    a deeper symlink, a bind mount, a `dz` bug, a filesystem alias nobody has named yet.
    So the probe now asks about the OUTCOME instead: the canary must be PRESENT in the
    brain and ABSENT from the shared store. Those two facts together pin down that the
    two stores are different stores, whatever mechanism might have made them the same.
    The canary is nonce-bearing and deliberately non-medical, so looking for it in the
    shared store is safe — that is why it can be used this way.
    """
    # A UNIQUE canary, looked up BY ITS OWN TEXT. Counting `after > before` accepted any
    # growth, so under mixed CLI versions a concurrent process could satisfy this check
    # while THIS process's canary went to the shared store — and the real lesson followed
    # it. A count is a fact about the store; only the probe's own presence is a fact
    # about this write.
    nonce = uuid.uuid4().hex[:12]
    canary = f"{_CANARY_TEXT} [{nonce}]"
    code, _, err = _run_dz([
        "teach", canary, "--reward", "0.1", "--domain", LEARNING_DOMAIN,
        "--type", "lesson-learned", "--project", brain, "--no-mirror",
    ])
    if code == 127:
        return True, ""   # dz absent — handled by the caller, not a routing failure
    if code != 0:
        return False, f"the routing self-test could not run ({err.strip() or 'unknown error'})"
    if not _canary_present(brain, canary):
        return False, (
            "this `dz` does not honour --project on a write.\n"
            f"  A self-test lesson was written and did NOT appear in {brain}, which means\n"
            "  it went to the SHARED store instead. Your lesson was NOT written.\n"
            f'  Find and remove the stray probe: dz recall "{canary}"\n'
            "  Then upgrade: npm i -g @dzhechkov/harness-cli"
        )
    # …and ABSENT from the shared store. Presence in the brain alone is satisfied by any
    # alias that makes the two paths one store; absence from the shared store is not.
    shared = os.path.realpath(project or os.getcwd())
    shared_readable, shared_ids = _canary_lookup(shared, canary)
    if shared_readable and shared_ids:
        # Clean up through BOTH paths: if they are one store either call removes it, and
        # if they are somehow two, both are left clean. A refusal must not leave probes
        # behind any more than a success does.
        _forget_canary(shared, canary)
        _forget_canary(brain, canary)
        return False, (
            "the health brain and the SHARED store are the SAME store.\n"
            f"  A self-test lesson was written to {brain} and then FOUND in the shared\n"
            f"  store at {shared}. Some alias makes one store answer to both paths — a\n"
            "  symlink INSIDE the brain (`.health-brain/.dz/memory` is the one that has\n"
            "  been seen), a bind mount, or a `dz` that resolves --project elsewhere.\n"
            "  Your lesson was NOT written: ADR-004 says health lessons never reach the\n"
            "  shared store, and here they would.\n"
            f'  The probe is nonce [{nonce}]; if any copy survived this cleanup, find and\n'
            f'  remove it: dz recall "{canary}"\n'
            f"  Then remove the alias under {brain} and teach again."
        )
    _forget_canary(brain, canary)
    return True, ""


def _canary_present(brain: str, canary: str) -> bool:
    """Is THIS probe in the brain? Asked by exact text, not by a count."""
    return _canary_lookup(brain, canary)[1] != []


def _canary_lookup(project: str, canary: str) -> Tuple[bool, List[str]]:
    """(was the store READABLE?, the ids this probe has inside it).

    The two answers are kept apart because absence and unreadability are different
    facts. An unreadable SHARED store is not evidence that the probe leaked into it —
    and it is positive evidence that the two paths are not one store, since the very
    same command answered for the brain a moment earlier.
    """
    code, out, _ = _run_dz(["recall", "--usage", "--json", "--project", project,
                            "--include-domain", LEARNING_DOMAIN], timeout=90)
    if code != 0:
        return False, []
    try:
        report = json.loads(out)
    except (ValueError, TypeError):
        return False, []
    found: List[str] = []

    def walk(node: object) -> None:
        if isinstance(node, dict):
            if node.get("pattern") == canary and node.get("dzId"):
                found.append(str(node["dzId"]))
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(report)
    return True, list(dict.fromkeys(found))


def _forget_canary(brain: str, canary: str) -> None:
    """Remove the probe. `--forget` takes dzIds, NOT text.

    The first version passed the canary TEXT and the probe stayed in the brain forever —
    caught by running the flow, not by the suite: the mock returned success for `forget`,
    so the test blessed a cleanup that never cleaned. Failure here is harmless (the text
    says what it is), so it never blocks teaching — but it should still actually work.
    """
    for dz_id in _canary_lookup(brain, canary)[1]:
        _run_dz(["recall", "--forget", dz_id, "--apply", "--project", brain])


def _brain_count(brain: str) -> Optional[int]:
    """How many lessons the health brain holds, or None if it cannot be read.

    `--include-domain` is REQUIRED here, and forgetting it made the verification defeat
    itself: `recall --all` applies the export hold-out, which withholds exactly this
    domain, so a health-only brain reported 0 before AND 0 after a successful write and
    the bridge declared failure. A check built on top of another safety measure has to
    account for that measure — and this counting is a local read of our own store, not an
    export, which is precisely the case the opt-in exists for.
    """
    code, out, _ = _run_dz(["recall", "--all", "--stats", "--project", brain,
                            "--include-domain", LEARNING_DOMAIN], timeout=90)
    if code != 0:
        return None
    match = re.search(r"(\d+)\s+learned pattern", out)
    return int(match.group(1)) if match else None


def teach(lesson: str, reward: float = 0.8, confirmed: bool = False) -> Tuple[int, str]:
    """Record a METHOD lesson. Two things must hold, and they are different in kind.

    The FORMAT check runs here and can refuse — identifiers have a shape.
    The MEANING check is `confirmed`: the caller asserts it performed the teach
    protocol in SKILL.md (write the rule without the case; read it back hunting for
    the one person). This file does NOT verify that assertion and does not pretend
    to — it records that a judging agent made the call, which is the honest
    description of what happened.
    """
    if lesson.startswith("--"):
        return 1, "refusing a lesson that starts with '--': dz would read it as an option, not as text"
    verdict = check_lesson(lesson)
    if not verdict.ok:
        return 1, verdict.note
    if not confirmed:
        return 1, (
            verdict.note
            + "\n\nNOT RECORDED. This lesson has not been confirmed as a method.\n"
            "  1. Write the RULE it taught, not the case — if the rule cannot be written\n"
            "     without the specific reading, there is no lesson yet, only a finding.\n"
            "  2. Read it back: could someone who knows this person recognise them?\n"
            "     A rare combination identifies without any name or number.\n"
            "  3. Re-run with --confirm-method to assert you did both.\n"
            "  The full protocol, with examples, is in SKILL.md."
        )
    distinct, brain = _health_brain_is_distinct()
    if not distinct:
        return 1, brain
    try:
        _protect_brain(brain)
    except RuntimeError as exc:
        return 1, f"REFUSED — {exc}"
    # PRE-FLIGHT: prove the routing works before the real lesson is anywhere.
    routes, why = _project_write_lands(brain)
    if not routes:
        return 1, f"REFUSED — {why}"
    before = _brain_count(brain)
    code, out, err = _run_dz([
        "teach", lesson, "--reward", str(float(reward)), "--domain", LEARNING_DOMAIN,
        "--type", "lesson-learned", "--project", brain,
    ])
    if code == 127:
        return 0, err  # not an error: the package works without dz
    if code != 0:
        return 1, f"teach failed: {err.strip() or out.strip()}"

    # VERIFY THE WRITE LANDED rather than trusting the exit code. An older CLI (0.3.173)
    # parsed `--project` and then wrote from the current directory anyway, returning 0 —
    # so this bridge would have reported a lesson safely in the health brain while it sat
    # in the shared one. `recall` already carried that lesson (probe the capability, never
    # trust an exit code); the write path did not until review said so.
    #
    # Counting before and after is deliberately cruder than parsing a path: a count is
    # what every version reports the same way. If it did not move, the lesson went
    # somewhere we did not ask for, and the reader is told to go and look.
    after = _brain_count(brain)
    # FAIL CLOSED when the count is unavailable. Requiring BOTH numbers to be integers
    # meant the verification was skipped in exactly the case it could not verify — the
    # same shape as a gate that cannot run its test and reports green. An unreadable
    # brain is not evidence the write landed.
    if before is None or after is None:
        return 1, (
            "FAILED — the write could not be VERIFIED: the health brain's count is "
            f"unreadable ({brain}).\n"
            "  `dz` reported success, but this bridge cannot confirm the lesson landed "
            "there rather than in the shared store, so it does not claim it did."
        )
    if after <= before:
        return 1, (
            "FAILED — `dz` reported success but the health brain did not grow.\n"
            f"  The lesson may have gone to the SHARED store instead of {brain}.\n"
            "  An older CLI accepts --project on a write and ignores it. Check the shared\n"
            "  store, then upgrade: npm i -g @dzhechkov/harness-cli"
        )
    tail = ("\n" + "\n".join(f"  NOTICED: {n}" for n in verdict.notices)) if verdict.notices else ""
    return 0, f"recorded in the health brain ({brain}), confirmed by the caller{tail}"


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="health-advisor ⇄ dz self-learning bridge")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    p_recall = sub.add_parser("recall")
    p_recall.add_argument("query")
    p_recall.add_argument("--limit", type=int, default=5)
    p_teach = sub.add_parser("teach")
    p_teach.add_argument("lesson")
    p_teach.add_argument("--reward", type=float, default=0.8)
    p_teach.add_argument("--confirm-method", action="store_true", dest="confirm_method",
                         help="you performed the teach protocol in SKILL.md: wrote the RULE rather "
                              "than the case, and read it back hunting for the one person. This "
                              "file cannot verify that and does not pretend to.")
    p_check = sub.add_parser("check")
    p_check.add_argument("lesson")
    args = parser.parse_args(argv)

    if args.cmd == "status":
        print(status())
        return 0
    if args.cmd == "recall":
        print(recall(args.query, args.limit))
        return 0
    if args.cmd == "check":
        verdict = check_lesson(args.lesson)
        print(verdict.note)
        return 0 if verdict.ok else 1
    code, message = teach(args.lesson, args.reward, confirmed=args.confirm_method)
    print(message)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
