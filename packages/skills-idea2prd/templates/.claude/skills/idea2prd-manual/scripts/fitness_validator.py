#!/usr/bin/env python3
"""
Architecture Fitness Functions Validator for idea2prd skills.
Validates architecture compliance against defined fitness functions.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Callable, Optional, Any
from enum import Enum
from datetime import datetime
import json
import re


class FitnessCategory(Enum):
    STRUCTURAL = "structural"
    ADR_COMPLIANCE = "adr_compliance"
    PERFORMANCE = "performance"
    SECURITY = "security"
    DATA_INTEGRITY = "data_integrity"
    OPERATIONAL = "operational"


class FitnessStatus(Enum):
    PASS = "pass"
    FAIL = "fail"
    WARN = "warn"
    SKIP = "skip"


@dataclass
class FitnessResult:
    """Result of a single fitness function evaluation."""
    function_id: str
    name: str
    category: FitnessCategory
    status: FitnessStatus
    current_value: Any
    threshold: Any
    message: str
    details: Dict = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> dict:
        return {
            "id": self.function_id,
            "name": self.name,
            "category": self.category.value,
            "status": self.status.value,
            "current": self.current_value,
            "threshold": self.threshold,
            "message": self.message,
            "details": self.details,
            "timestamp": self.timestamp.isoformat()
        }


@dataclass
class FitnessFunction:
    """Definition of an architecture fitness function."""
    id: str
    name: str
    category: FitnessCategory
    description: str
    rule: str
    threshold: Any
    validator: Callable[..., FitnessResult]
    related_adr: Optional[str] = None
    related_nfr: Optional[str] = None
    frequency: str = "every_commit"
    tools: List[str] = field(default_factory=list)

    def validate(self, context: Dict) -> FitnessResult:
        """Execute the fitness function validation."""
        return self.validator(self, context)


class FitnessFunctionRegistry:
    """Registry for managing fitness functions."""

    def __init__(self):
        self.functions: Dict[str, FitnessFunction] = {}

    def register(self, func: FitnessFunction):
        """Register a fitness function."""
        self.functions[func.id] = func

    def get(self, func_id: str) -> Optional[FitnessFunction]:
        """Get a fitness function by ID."""
        return self.functions.get(func_id)

    def get_by_category(self, category: FitnessCategory) -> List[FitnessFunction]:
        """Get all fitness functions in a category."""
        return [f for f in self.functions.values() if f.category == category]

    def validate_all(self, context: Dict) -> List[FitnessResult]:
        """Run all registered fitness functions."""
        results = []
        for func in self.functions.values():
            try:
                result = func.validate(context)
                results.append(result)
            except Exception as e:
                results.append(FitnessResult(
                    function_id=func.id,
                    name=func.name,
                    category=func.category,
                    status=FitnessStatus.FAIL,
                    current_value=None,
                    threshold=func.threshold,
                    message=f"Validation error: {str(e)}",
                    details={"error": str(e)}
                ))
        return results


# =============================================================================
# Standard Fitness Function Validators
# =============================================================================

def validate_bounded_context_independence(func: FitnessFunction, context: Dict) -> FitnessResult:
    """
    FF-001: Validate that bounded contexts don't directly access each other's databases.
    """
    violations = context.get("cross_context_db_access", [])
    violation_count = len(violations)

    return FitnessResult(
        function_id=func.id,
        name=func.name,
        category=func.category,
        status=FitnessStatus.PASS if violation_count == 0 else FitnessStatus.FAIL,
        current_value=violation_count,
        threshold=func.threshold,
        message=f"Found {violation_count} cross-context DB access violations" if violations else "No violations found",
        details={"violations": violations}
    )


def validate_aggregate_size(func: FitnessFunction, context: Dict) -> FitnessResult:
    """
    FF-002: Validate that aggregates don't exceed entity limit.
    """
    aggregates = context.get("aggregates", {})
    violations = []

    for agg_name, entity_count in aggregates.items():
        if entity_count > func.threshold:
            violations.append({
                "aggregate": agg_name,
                "entity_count": entity_count,
                "limit": func.threshold
            })

    return FitnessResult(
        function_id=func.id,
        name=func.name,
        category=func.category,
        status=FitnessStatus.PASS if not violations else FitnessStatus.FAIL,
        current_value=max(aggregates.values()) if aggregates else 0,
        threshold=func.threshold,
        message=f"{len(violations)} aggregates exceed size limit" if violations else "All aggregates within limits",
        details={"violations": violations, "aggregates": aggregates}
    )


def validate_api_compliance(func: FitnessFunction, context: Dict) -> FitnessResult:
    """
    FF-003: Validate API endpoints follow defined style (REST/GraphQL).
    """
    total_endpoints = context.get("total_endpoints", 0)
    compliant_endpoints = context.get("compliant_endpoints", 0)

    if total_endpoints == 0:
        return FitnessResult(
            function_id=func.id,
            name=func.name,
            category=func.category,
            status=FitnessStatus.SKIP,
            current_value=0,
            threshold=func.threshold,
            message="No endpoints to validate"
        )

    compliance_rate = (compliant_endpoints / total_endpoints) * 100

    return FitnessResult(
        function_id=func.id,
        name=func.name,
        category=func.category,
        status=FitnessStatus.PASS if compliance_rate >= func.threshold else FitnessStatus.FAIL,
        current_value=compliance_rate,
        threshold=func.threshold,
        message=f"API compliance: {compliance_rate:.1f}%",
        details={
            "total_endpoints": total_endpoints,
            "compliant_endpoints": compliant_endpoints,
            "non_compliant": context.get("non_compliant_endpoints", [])
        }
    )


def validate_auth_coverage(func: FitnessFunction, context: Dict) -> FitnessResult:
    """
    FF-004: Validate all non-public endpoints require authentication.
    """
    protected_endpoints = context.get("protected_endpoints", 0)
    total_private_endpoints = context.get("total_private_endpoints", 0)

    if total_private_endpoints == 0:
        return FitnessResult(
            function_id=func.id,
            name=func.name,
            category=func.category,
            status=FitnessStatus.SKIP,
            current_value=100,
            threshold=func.threshold,
            message="No private endpoints to validate"
        )

    coverage = (protected_endpoints / total_private_endpoints) * 100

    return FitnessResult(
        function_id=func.id,
        name=func.name,
        category=func.category,
        status=FitnessStatus.PASS if coverage >= func.threshold else FitnessStatus.FAIL,
        current_value=coverage,
        threshold=func.threshold,
        message=f"Auth coverage: {coverage:.1f}%",
        details={
            "protected": protected_endpoints,
            "total_private": total_private_endpoints,
            "unprotected": context.get("unprotected_endpoints", [])
        }
    )


def validate_test_coverage(func: FitnessFunction, context: Dict) -> FitnessResult:
    """
    FF-005: Validate test coverage meets threshold.
    """
    coverage = context.get("test_coverage", 0)

    return FitnessResult(
        function_id=func.id,
        name=func.name,
        category=func.category,
        status=FitnessStatus.PASS if coverage >= func.threshold else FitnessStatus.FAIL,
        current_value=coverage,
        threshold=func.threshold,
        message=f"Test coverage: {coverage:.1f}%",
        details=context.get("coverage_details", {})
    )


def validate_dependency_direction(func: FitnessFunction, context: Dict) -> FitnessResult:
    """
    FF-006: Validate dependencies flow inward (Infrastructure → Application → Domain).
    """
    violations = context.get("dependency_violations", [])

    return FitnessResult(
        function_id=func.id,
        name=func.name,
        category=func.category,
        status=FitnessStatus.PASS if not violations else FitnessStatus.FAIL,
        current_value=len(violations),
        threshold=func.threshold,
        message=f"Found {len(violations)} dependency direction violations" if violations else "Dependencies flow correctly",
        details={"violations": violations}
    )


# =============================================================================
# Fitness Function Factory
# =============================================================================

def create_standard_fitness_functions() -> FitnessFunctionRegistry:
    """Create a registry with standard fitness functions."""
    registry = FitnessFunctionRegistry()

    # FF-001: Bounded Context Independence
    registry.register(FitnessFunction(
        id="FF-001",
        name="Bounded Context Independence",
        category=FitnessCategory.STRUCTURAL,
        description="No direct database access across bounded contexts",
        rule="Bounded contexts must communicate via events or APIs, not direct DB access",
        threshold=0,
        validator=validate_bounded_context_independence,
        tools=["dependency-cruiser", "custom linter"]
    ))

    # FF-002: Aggregate Size Limit
    registry.register(FitnessFunction(
        id="FF-002",
        name="Aggregate Size Limit",
        category=FitnessCategory.STRUCTURAL,
        description="Aggregates should have ≤7 entities",
        rule="Each aggregate must contain no more than 7 entities",
        threshold=7,
        validator=validate_aggregate_size,
        tools=["AST analysis", "custom script"]
    ))

    # FF-003: API Style Compliance
    registry.register(FitnessFunction(
        id="FF-003",
        name="API Style Compliance",
        category=FitnessCategory.ADR_COMPLIANCE,
        description="All endpoints follow defined API style",
        rule="100% of endpoints must comply with chosen API style (REST/GraphQL)",
        threshold=100,
        validator=validate_api_compliance,
        related_adr="ADR-003",
        tools=["Spectral", "GraphQL linter"]
    ))

    # FF-004: Authentication Coverage
    registry.register(FitnessFunction(
        id="FF-004",
        name="Authentication Coverage",
        category=FitnessCategory.SECURITY,
        description="All non-public endpoints require authentication",
        rule="100% of private endpoints must require authentication",
        threshold=100,
        validator=validate_auth_coverage,
        related_adr="ADR-004",
        tools=["custom security scan", "OWASP ZAP"]
    ))

    # FF-005: Test Coverage
    registry.register(FitnessFunction(
        id="FF-005",
        name="Test Coverage",
        category=FitnessCategory.OPERATIONAL,
        description="Code coverage meets minimum threshold",
        rule="Test coverage must be ≥80%",
        threshold=80,
        validator=validate_test_coverage,
        related_nfr="NFR-T01",
        tools=["Jest", "c8", "Istanbul"]
    ))

    # FF-006: Dependency Direction
    registry.register(FitnessFunction(
        id="FF-006",
        name="Dependency Direction",
        category=FitnessCategory.STRUCTURAL,
        description="Dependencies flow inward following clean architecture",
        rule="Infrastructure → Application → Domain (no reverse dependencies)",
        threshold=0,
        validator=validate_dependency_direction,
        tools=["dependency-cruiser", "madge"]
    ))

    return registry


# =============================================================================
# Report Generator
# =============================================================================

def generate_fitness_report(results: List[FitnessResult]) -> str:
    """Generate a markdown fitness report."""
    lines = [
        "# Architecture Fitness Report",
        "",
        f"**Generated:** {datetime.now().isoformat()}",
        "",
        "## Summary",
        "",
        "| Status | Count |",
        "|--------|-------|"
    ]

    # Count by status
    status_counts = {}
    for result in results:
        status = result.status.value
        status_counts[status] = status_counts.get(status, 0) + 1

    for status, count in status_counts.items():
        emoji = {"pass": "✅", "fail": "🔴", "warn": "⚠️", "skip": "⏭️"}.get(status, "")
        lines.append(f"| {emoji} {status.upper()} | {count} |")

    lines.extend(["", "## Details", ""])

    # Group by category
    by_category = {}
    for result in results:
        cat = result.category.value
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(result)

    for category, cat_results in by_category.items():
        lines.append(f"### {category.replace('_', ' ').title()}")
        lines.append("")

        for result in cat_results:
            emoji = {"pass": "✅", "fail": "🔴", "warn": "⚠️", "skip": "⏭️"}.get(result.status.value, "")
            lines.append(f"#### {emoji} {result.function_id}: {result.name}")
            lines.append("")
            lines.append(f"- **Status:** {result.status.value.upper()}")
            lines.append(f"- **Current:** {result.current_value}")
            lines.append(f"- **Threshold:** {result.threshold}")
            lines.append(f"- **Message:** {result.message}")
            lines.append("")

    return "\n".join(lines)


# =============================================================================
# Main / Example Usage
# =============================================================================

if __name__ == "__main__":
    # Create registry with standard functions
    registry = create_standard_fitness_functions()

    # Example context (would come from actual analysis)
    context = {
        "cross_context_db_access": [],
        "aggregates": {
            "User": 3,
            "Order": 5,
            "Product": 2
        },
        "total_endpoints": 20,
        "compliant_endpoints": 19,
        "non_compliant_endpoints": ["/legacy/endpoint"],
        "protected_endpoints": 18,
        "total_private_endpoints": 18,
        "test_coverage": 85.5,
        "dependency_violations": []
    }

    # Run all validations
    results = registry.validate_all(context)

    # Generate report
    report = generate_fitness_report(results)
    print(report)

    # Also output as JSON for programmatic use
    print("\n" + "=" * 60)
    print("JSON Output:")
    print("=" * 60)
    print(json.dumps([r.to_dict() for r in results], indent=2, default=str))
