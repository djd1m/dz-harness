#!/usr/bin/env python3
"""
C4 Model Diagram Generator for idea2prd skills.
Generates Mermaid C4 diagrams from structured input.
"""

from dataclasses import dataclass, field
from typing import List, Optional
from enum import Enum


class ContainerType(Enum):
    WEB_APP = "Container"
    API = "Container"
    DATABASE = "ContainerDb"
    QUEUE = "ContainerQueue"
    MOBILE = "Container"
    WORKER = "Container"


@dataclass
class Person:
    alias: str
    name: str
    description: str = ""
    external: bool = False

    def to_mermaid(self) -> str:
        func = "Person_Ext" if self.external else "Person"
        return f'{func}({self.alias}, "{self.name}", "{self.description}")'


@dataclass
class System:
    alias: str
    name: str
    description: str = ""
    external: bool = False

    def to_mermaid(self) -> str:
        func = "System_Ext" if self.external else "System"
        return f'{func}({self.alias}, "{self.name}", "{self.description}")'


@dataclass
class Container:
    alias: str
    name: str
    technology: str
    description: str
    container_type: ContainerType = ContainerType.API

    def to_mermaid(self) -> str:
        return f'{self.container_type.value}({self.alias}, "{self.name}", "{self.technology}", "{self.description}")'


@dataclass
class Component:
    alias: str
    name: str
    technology: str
    description: str

    def to_mermaid(self) -> str:
        return f'Component({self.alias}, "{self.name}", "{self.technology}", "{self.description}")'


@dataclass
class Relationship:
    from_alias: str
    to_alias: str
    label: str
    technology: str = ""

    def to_mermaid(self) -> str:
        if self.technology:
            return f'Rel({self.from_alias}, {self.to_alias}, "{self.label}", "{self.technology}")'
        return f'Rel({self.from_alias}, {self.to_alias}, "{self.label}")'


@dataclass
class C4Diagram:
    title: str
    elements: List = field(default_factory=list)
    relationships: List[Relationship] = field(default_factory=list)
    boundaries: dict = field(default_factory=dict)

    def add_person(self, alias: str, name: str, description: str = "", external: bool = False):
        self.elements.append(Person(alias, name, description, external))
        return self

    def add_system(self, alias: str, name: str, description: str = "", external: bool = False):
        self.elements.append(System(alias, name, description, external))
        return self

    def add_container(self, alias: str, name: str, technology: str, description: str, 
                      container_type: ContainerType = ContainerType.API, boundary: str = None):
        container = Container(alias, name, technology, description, container_type)
        if boundary:
            if boundary not in self.boundaries:
                self.boundaries[boundary] = []
            self.boundaries[boundary].append(container)
        else:
            self.elements.append(container)
        return self

    def add_component(self, alias: str, name: str, technology: str, description: str, boundary: str = None):
        component = Component(alias, name, technology, description)
        if boundary:
            if boundary not in self.boundaries:
                self.boundaries[boundary] = []
            self.boundaries[boundary].append(component)
        else:
            self.elements.append(component)
        return self

    def add_relationship(self, from_alias: str, to_alias: str, label: str, technology: str = ""):
        self.relationships.append(Relationship(from_alias, to_alias, label, technology))
        return self


class C4Generator:
    """Generates C4 diagrams in Mermaid format."""

    @staticmethod
    def generate_context_diagram(diagram: C4Diagram) -> str:
        """Generate Level 1: System Context diagram."""
        lines = [
            "```mermaid",
            "C4Context",
            f'    title {diagram.title}',
            ""
        ]

        # Add elements
        for elem in diagram.elements:
            lines.append(f"    {elem.to_mermaid()}")

        lines.append("")

        # Add relationships
        for rel in diagram.relationships:
            lines.append(f"    {rel.to_mermaid()}")

        lines.append("```")
        return "\n".join(lines)

    @staticmethod
    def generate_container_diagram(diagram: C4Diagram, system_name: str) -> str:
        """Generate Level 2: Container diagram."""
        lines = [
            "```mermaid",
            "C4Container",
            f'    title {diagram.title}',
            ""
        ]

        # Add non-boundary elements (persons, external systems)
        for elem in diagram.elements:
            if isinstance(elem, (Person, System)):
                lines.append(f"    {elem.to_mermaid()}")

        lines.append("")

        # Add system boundary with containers
        if diagram.boundaries:
            for boundary_name, containers in diagram.boundaries.items():
                lines.append(f'    Container_Boundary({boundary_name.lower().replace(" ", "_")}, "{boundary_name}") {{')
                for container in containers:
                    lines.append(f"        {container.to_mermaid()}")
                lines.append("    }")
                lines.append("")

        # Add relationships
        for rel in diagram.relationships:
            lines.append(f"    {rel.to_mermaid()}")

        lines.append("```")
        return "\n".join(lines)

    @staticmethod
    def generate_component_diagram(diagram: C4Diagram, container_name: str) -> str:
        """Generate Level 3: Component diagram."""
        lines = [
            "```mermaid",
            "C4Component",
            f'    title {diagram.title}',
            ""
        ]

        # Add container boundary with components
        if diagram.boundaries:
            for boundary_name, components in diagram.boundaries.items():
                lines.append(f'    Container_Boundary({boundary_name.lower().replace(" ", "_")}, "{boundary_name}") {{')
                for component in components:
                    lines.append(f"        {component.to_mermaid()}")
                lines.append("    }")
                lines.append("")

        # Add external elements
        for elem in diagram.elements:
            lines.append(f"    {elem.to_mermaid()}")

        lines.append("")

        # Add relationships
        for rel in diagram.relationships:
            lines.append(f"    {rel.to_mermaid()}")

        lines.append("```")
        return "\n".join(lines)


def generate_standard_saas_c4(product_name: str, bounded_contexts: List[str]) -> dict:
    """
    Generate standard C4 diagrams for a typical SaaS application.
    
    Args:
        product_name: Name of the product
        bounded_contexts: List of bounded context names
    
    Returns:
        Dictionary with context, container, and component diagrams
    """
    diagrams = {}

    # Level 1: System Context
    context = C4Diagram(title=f"System Context: {product_name}")
    context.add_person("user", "User", "Primary user of the system")
    context.add_person("admin", "Administrator", "System administrator", external=False)
    context.add_system("system", product_name, "The main system")
    context.add_system("email", "Email Service", "Sends notifications", external=True)
    context.add_system("auth", "Identity Provider", "SSO/OAuth", external=True)
    context.add_relationship("user", "system", "Uses", "HTTPS")
    context.add_relationship("admin", "system", "Manages", "HTTPS")
    context.add_relationship("system", "email", "Sends via", "SMTP/API")
    context.add_relationship("system", "auth", "Authenticates via", "OAuth 2.0")

    diagrams["context"] = C4Generator.generate_context_diagram(context)

    # Level 2: Container
    container = C4Diagram(title=f"Container Diagram: {product_name}")
    container.add_person("user", "User", "")
    container.add_container("spa", "Web Application", "React, TypeScript", "User interface", 
                           ContainerType.WEB_APP, product_name)
    container.add_container("api", "API Server", "Node.js, Express", "Business logic and REST API",
                           ContainerType.API, product_name)
    container.add_container("worker", "Background Worker", "Node.js", "Async job processing",
                           ContainerType.WORKER, product_name)
    container.add_container("db", "Database", "PostgreSQL", "Application data",
                           ContainerType.DATABASE, product_name)
    container.add_container("cache", "Cache", "Redis", "Session & cache",
                           ContainerType.DATABASE, product_name)
    container.add_system("email", "Email Service", "", external=True)

    container.add_relationship("user", "spa", "Uses", "HTTPS")
    container.add_relationship("spa", "api", "Calls", "REST/JSON")
    container.add_relationship("api", "db", "Reads/Writes", "SQL")
    container.add_relationship("api", "cache", "Caches", "Redis")
    container.add_relationship("worker", "db", "Reads/Writes", "SQL")
    container.add_relationship("worker", "email", "Sends via", "API")

    diagrams["container"] = C4Generator.generate_container_diagram(container, product_name)

    # Level 3: Component diagrams for each bounded context
    for bc in bounded_contexts:
        component = C4Diagram(title=f"Component Diagram: {bc} Context")
        component.add_component("ctrl", f"{bc} Controller", "Express Router", "HTTP endpoints",
                               boundary="API Server")
        component.add_component("app", f"{bc} App Service", "TypeScript", "Use case orchestration",
                               boundary="API Server")
        component.add_component("domain", f"{bc} Domain", "TypeScript", "Business logic",
                               boundary="API Server")
        component.add_component("repo", f"{bc} Repository", "TypeScript", "Data access",
                               boundary="API Server")
        component.add_container("db", "Database", "PostgreSQL", "", ContainerType.DATABASE)

        component.add_relationship("ctrl", "app", "Calls")
        component.add_relationship("app", "domain", "Uses")
        component.add_relationship("app", "repo", "Uses")
        component.add_relationship("repo", "db", "SQL")

        diagrams[f"component_{bc.lower().replace(' ', '_')}"] = C4Generator.generate_component_diagram(
            component, "API Server"
        )

    return diagrams


# Example usage
if __name__ == "__main__":
    # Generate diagrams for a sample product
    diagrams = generate_standard_saas_c4(
        product_name="Habit Tracker",
        bounded_contexts=["User Management", "Habits", "Analytics"]
    )

    print("=" * 60)
    print("CONTEXT DIAGRAM")
    print("=" * 60)
    print(diagrams["context"])

    print("\n" + "=" * 60)
    print("CONTAINER DIAGRAM")
    print("=" * 60)
    print(diagrams["container"])

    print("\n" + "=" * 60)
    print("COMPONENT DIAGRAM: Habits")
    print("=" * 60)
    print(diagrams["component_habits"])
