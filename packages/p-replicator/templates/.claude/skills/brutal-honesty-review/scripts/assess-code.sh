#!/bin/bash
# Brutal Honesty Code Assessment Script (Linus Mode)

set -e

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "🔥 BRUTAL HONESTY CODE ASSESSMENT (Linus Mode)"
echo "================================================"
echo ""

# Check if file argument provided
if [ -z "$1" ]; then
    echo "⚠️  check did NOT run: no argument given"
    echo "Usage: $0 <file-or-directory>"
    exit 2
fi

TARGET="$1"

# ── Findings counter ─────────────────────────────────────────────────────────
#
# This script DETECTED correctly and could not FAIL. MEASURED 2026-08-27: deliberately awful input
# produced red verdicts on screen and exit 0, while a nonexistent path exited 1 — "I could not
# check" was louder than "I found violations", so any gate reading 1 could not tell them apart.
#
# Nothing about the detection changed. What was missing is that nobody counted.
#
#   0  ran, found nothing
#   1  ran, found violations — the count is printed
#   2  COULD NOT CHECK: no argument, or a target that does not exist
FINDINGS=0
finding() { FINDINGS=$((FINDINGS + 1)); }

if [ ! -e "$TARGET" ]; then
    echo "⚠️  check did NOT run: '$TARGET' does not exist"
    echo "   → This is NOT a clean bill: nothing was examined."
    exit 2
fi


# Function to assess correctness
assess_correctness() {
    echo "📊 CORRECTNESS CHECK"
    echo "-------------------"

    # Check for common bug patterns
    if grep -r "TODO\|FIXME\|BUG\|HACK" "$TARGET" 2>/dev/null; then
        echo -e "${RED}🔴 FAILING: Found TODO/FIXME/BUG/HACK comments${NC}"; finding
        echo "   → This code admits it's broken. Fix it before review."
        return 0
    fi

    # Check for error-prone patterns
    if grep -r "null\|undefined" "$TARGET" 2>/dev/null | grep -v "!== null" | grep -v "!== undefined" > /dev/null; then
        echo -e "${YELLOW}🟡 WARNING: Potential null/undefined issues${NC}"
        echo "   → Are you handling null cases properly?"
    fi

    echo -e "${GREEN}✓ No obvious correctness issues${NC}"
}

# Function to assess performance
assess_performance() {
    echo ""
    echo "⚡ PERFORMANCE CHECK"
    echo "-------------------"

    # Check for nested loops (potential O(n²))
    nested_loops=$(grep -r "for.*{" "$TARGET" | wc -l)
    if [ "$nested_loops" -gt 5 ]; then
        echo -e "${RED}🔴 FAILING: Found $nested_loops loops${NC}"; finding
        echo "   → Are you creating O(n²) complexity where O(n) exists?"
        echo "   → Use hash maps, sets, or better algorithms."
    fi

    # Check for synchronous I/O in hot paths
    if grep -r "readFileSync\|writeFileSync" "$TARGET" 2>/dev/null; then
        echo -e "${RED}🔴 FAILING: Synchronous file I/O detected${NC}"; finding
        echo "   → You're blocking the event loop. Use async operations."
    fi

    echo -e "${GREEN}✓ No obvious performance issues${NC}"
}

# Function to assess error handling
assess_error_handling() {
    echo ""
    echo "🛡️  ERROR HANDLING CHECK"
    echo "----------------------"

    # Check for try/catch usage
    try_count=$(grep -r "try\|catch" "$TARGET" 2>/dev/null | wc -l)
    if [ "$try_count" -eq 0 ]; then
        echo -e "${RED}🔴 FAILING: No error handling found${NC}"; finding
        echo "   → What happens when this code fails? It crashes."
    else
        echo -e "${GREEN}✓ Found error handling (verify it's sufficient)${NC}"
    fi

    # Check for empty catch blocks
    if grep -A 1 "catch" "$TARGET" 2>/dev/null | grep -q "^\s*}"; then
        echo -e "${RED}🔴 FAILING: Empty catch blocks detected${NC}"; finding
        echo "   → Swallowing errors silently is worse than crashing."
    fi
}

# Function to assess concurrency
assess_concurrency() {
    echo ""
    echo "🔀 CONCURRENCY CHECK"
    echo "-------------------"

    # Check for global state mutations
    if grep -r "global\.\|window\." "$TARGET" 2>/dev/null; then
        echo -e "${YELLOW}🟡 WARNING: Global state mutations detected${NC}"
        echo "   → Are you handling concurrent access safely?"
    fi

    # Check for race condition patterns
    if grep -r "setTimeout\|setInterval" "$TARGET" 2>/dev/null; then
        echo -e "${YELLOW}🟡 WARNING: Timing-based code detected${NC}"
        echo "   → Are you creating race conditions?"
    fi

    echo -e "${GREEN}✓ Review concurrency manually${NC}"
}

# Function to assess testability
assess_testability() {
    echo ""
    echo "🧪 TESTABILITY CHECK"
    echo "-------------------"

    # Check if tests exist
    if [ -d "tests" ] || [ -d "test" ] || [ -d "__tests__" ]; then
        echo -e "${GREEN}✓ Test directory exists${NC}"
    else
        echo -e "${RED}🔴 FAILING: No test directory found${NC}"; finding
        echo "   → Where are the tests? Did you even test this?"
    fi

    # Check for dependency injection
    if grep -r "new\s\+\w\+(" "$TARGET" 2>/dev/null | grep -v "Error\|Date" > /dev/null; then
        echo -e "${YELLOW}🟡 WARNING: Hard-coded dependencies detected${NC}"
        echo "   → Use dependency injection for testability."
    fi
}

# Function to assess maintainability
assess_maintainability() {
    echo ""
    echo "🔧 MAINTAINABILITY CHECK"
    echo "-----------------------"

    # Check function length (should be <50 lines)
    if [ -f "$TARGET" ]; then
        long_functions=$(awk '/^function|^const.*=>/ {start=NR} /^}/ {if(NR-start>50) print "Line",start}' "$TARGET" | wc -l)
        if [ "$long_functions" -gt 0 ]; then
            echo -e "${YELLOW}🟡 WARNING: Found $long_functions functions >50 lines${NC}"
            echo "   → Break down complex functions."
        fi
    fi

    # Check for magic numbers
    if grep -rE "\s[0-9]{3,}" "$TARGET" 2>/dev/null | grep -v "1000\|2000" > /dev/null; then
        echo -e "${YELLOW}🟡 WARNING: Magic numbers detected${NC}"
        echo "   → Use named constants."
    fi

    echo -e "${GREEN}✓ Review code clarity manually${NC}"
}

# Run all assessments
assess_correctness
assess_performance
assess_error_handling
assess_concurrency
assess_testability
assess_maintainability

# Final verdict
echo ""
echo "================================================"
echo "🎯 FINAL VERDICT"
echo "================================================"
echo ""
echo "Review the findings above. If you see multiple 🔴 FAILING marks,"
echo "this code is NOT ready for review."
echo ""
echo "Expected standards:"
echo "  - All error paths handled"
echo "  - No obvious performance issues"
echo "  - Tests exist and pass"
echo "  - Code is clear and maintainable"
echo ""
echo "If you wouldn't deploy this to production, don't submit it for review."

# ── Verdict ──────────────────────────────────────────────────────────────────
# ADDED, never substituted: the closing prose above is this skill's character and a reader wants it.
# What follows is the same answer in a form a gate can act on.
echo ""
if [ "$FINDINGS" -gt 0 ]; then
    echo "VERDICT: $FINDINGS finding(s). Not ready."
    exit 1
fi
echo "VERDICT: 0 findings."
exit 0
