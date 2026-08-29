#!/usr/bin/env python3
"""
pseudocode_generator.py - Генератор pseudocode для агрегатов и сервисов

Используется в Phase 4.5 для создания pseudocode файлов на основе
DDD Tactical design (Phase 4).

Usage:
    python pseudocode_generator.py --input tactical.json --output docs/pseudocode/
    
Input Format (tactical.json):
{
    "aggregates": [
        {
            "name": "Order",
            "boundedContext": "OrderManagement",
            "state": [
                {"name": "id", "type": "OrderId"},
                {"name": "status", "type": "OrderStatus"}
            ],
            "methods": [
                {
                    "name": "placeOrder",
                    "type": "command",
                    "params": [
                        {"name": "items", "type": "List<OrderItem>"},
                        {"name": "customer", "type": "Customer"}
                    ],
                    "returns": "OrderId",
                    "description": "Place a new order",
                    "businessRules": [
                        "Items cannot be empty",
                        "Customer must be verified",
                        "All items must be in stock"
                    ],
                    "emits": ["OrderPlacedEvent"]
                }
            ]
        }
    ],
    "services": [
        {
            "name": "PricingService",
            "boundedContext": "Pricing",
            "methods": [...]
        }
    ]
}
"""

import json
import argparse
from pathlib import Path
from typing import Dict, List, Any
from dataclasses import dataclass
from datetime import datetime


@dataclass
class MethodParam:
    name: str
    type: str


@dataclass
class Method:
    name: str
    type: str  # command, query, factory
    params: List[MethodParam]
    returns: str
    description: str
    business_rules: List[str]
    emits: List[str]


@dataclass
class StateField:
    name: str
    type: str


@dataclass
class Aggregate:
    name: str
    bounded_context: str
    state: List[StateField]
    methods: List[Method]


@dataclass
class Service:
    name: str
    bounded_context: str
    methods: List[Method]


class PseudocodeGenerator:
    """Generates pseudocode from DDD tactical design."""
    
    TEMPLATE_AGGREGATE = '''// File: {filename}
// Generated: {timestamp}
// Bounded Context: {bounded_context}

AGGREGATE {name}

    STATE:
{state_fields}
    END STATE

{methods}
END AGGREGATE
'''

    TEMPLATE_SERVICE = '''// File: {filename}
// Generated: {timestamp}
// Bounded Context: {bounded_context}

SERVICE {name}

{methods}
END SERVICE
'''

    TEMPLATE_METHOD = '''    //========================================
    // {method_type}: {description}
    //========================================
    FUNCTION {name}({params}) -> {returns}:
        
        // Pre-conditions
{validations}
        
        // Main logic
{logic}
        
        // Post-conditions
{postconditions}
{events}
        RETURN {return_value}
    END FUNCTION
'''

    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def generate_from_json(self, input_file: Path) -> Dict[str, str]:
        """Generate pseudocode files from JSON input."""
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        generated_files = {}
        
        # Process aggregates
        for agg_data in data.get('aggregates', []):
            aggregate = self._parse_aggregate(agg_data)
            filename = f"{aggregate.name}Aggregate.pseudo"
            content = self._generate_aggregate(aggregate)
            self._write_file(filename, content)
            generated_files[filename] = content
        
        # Process services
        for svc_data in data.get('services', []):
            service = self._parse_service(svc_data)
            filename = f"{service.name}.pseudo"
            content = self._generate_service(service)
            self._write_file(filename, content)
            generated_files[filename] = content
        
        # Generate index
        index_content = self._generate_index(generated_files)
        self._write_file('INDEX.md', index_content)
        generated_files['INDEX.md'] = index_content
        
        return generated_files
    
    def _parse_aggregate(self, data: Dict) -> Aggregate:
        """Parse aggregate from JSON."""
        return Aggregate(
            name=data['name'],
            bounded_context=data.get('boundedContext', 'Unknown'),
            state=[StateField(s['name'], s['type']) for s in data.get('state', [])],
            methods=[self._parse_method(m) for m in data.get('methods', [])]
        )
    
    def _parse_service(self, data: Dict) -> Service:
        """Parse service from JSON."""
        return Service(
            name=data['name'],
            bounded_context=data.get('boundedContext', 'Unknown'),
            methods=[self._parse_method(m) for m in data.get('methods', [])]
        )
    
    def _parse_method(self, data: Dict) -> Method:
        """Parse method from JSON."""
        return Method(
            name=data['name'],
            type=data.get('type', 'command'),
            params=[MethodParam(p['name'], p['type']) for p in data.get('params', [])],
            returns=data.get('returns', 'void'),
            description=data.get('description', ''),
            business_rules=data.get('businessRules', []),
            emits=data.get('emits', [])
        )
    
    def _generate_aggregate(self, aggregate: Aggregate) -> str:
        """Generate pseudocode for aggregate."""
        state_fields = '\n'.join(
            f"        {f.name}: {f.type}"
            for f in aggregate.state
        )
        
        methods = '\n'.join(
            self._generate_method(m)
            for m in aggregate.methods
        )
        
        return self.TEMPLATE_AGGREGATE.format(
            filename=f"{aggregate.name}Aggregate.pseudo",
            timestamp=datetime.now().isoformat(),
            bounded_context=aggregate.bounded_context,
            name=aggregate.name,
            state_fields=state_fields,
            methods=methods
        )
    
    def _generate_service(self, service: Service) -> str:
        """Generate pseudocode for service."""
        methods = '\n'.join(
            self._generate_method(m)
            for m in service.methods
        )
        
        return self.TEMPLATE_SERVICE.format(
            filename=f"{service.name}.pseudo",
            timestamp=datetime.now().isoformat(),
            bounded_context=service.bounded_context,
            name=service.name,
            methods=methods
        )
    
    def _generate_method(self, method: Method) -> str:
        """Generate pseudocode for a single method."""
        # Format parameters
        params = ', '.join(f"{p.name}: {p.type}" for p in method.params)
        
        # Generate validations from business rules
        validations = self._generate_validations(method.business_rules)
        
        # Generate placeholder logic
        logic = self._generate_logic_placeholder(method)
        
        # Generate postconditions
        postconditions = self._generate_postconditions(method)
        
        # Generate event emissions
        events = self._generate_events(method.emits)
        
        # Determine return value
        return_value = 'result' if method.returns != 'void' else ''
        if return_value == '' and method.returns == 'void':
            # Remove RETURN line for void methods
            return_template = self.TEMPLATE_METHOD.replace(
                '        RETURN {return_value}\n', ''
            )
        else:
            return_template = self.TEMPLATE_METHOD
        
        return return_template.format(
            method_type=method.type.upper(),
            description=method.description,
            name=method.name,
            params=params,
            returns=method.returns,
            validations=validations,
            logic=logic,
            postconditions=postconditions,
            events=events,
            return_value=return_value
        )
    
    def _generate_validations(self, rules: List[str]) -> str:
        """Generate VALIDATE statements from business rules."""
        if not rules:
            return "        // No explicit validations"
        
        validations = []
        for rule in rules:
            # Convert natural language rule to pseudocode
            validation = self._rule_to_validation(rule)
            validations.append(f"        VALIDATE {validation}")
        
        return '\n'.join(validations)
    
    def _rule_to_validation(self, rule: str) -> str:
        """Convert business rule to validation pseudocode."""
        rule_lower = rule.lower()
        
        # Pattern matching for common rules
        if 'cannot be empty' in rule_lower or 'not empty' in rule_lower:
            subject = rule.split()[0].lower()
            return f"{subject} IS NOT empty ELSE throw ValidationError(\"{rule}\")"
        
        if 'must be' in rule_lower:
            parts = rule.split('must be')
            subject = parts[0].strip().lower().replace(' ', '_')
            condition = parts[1].strip()
            return f"{subject}.is{condition.title().replace(' ', '')} ELSE throw ValidationError(\"{rule}\")"
        
        if 'must have' in rule_lower:
            parts = rule.split('must have')
            subject = parts[0].strip().lower().replace(' ', '_')
            what = parts[1].strip()
            return f"{subject}.has{what.title().replace(' ', '')} ELSE throw ValidationError(\"{rule}\")"
        
        # Default: just use the rule as-is
        return f"/* {rule} */"
    
    def _generate_logic_placeholder(self, method: Method) -> str:
        """Generate placeholder logic based on method type."""
        if method.type == 'command':
            return '''        // TODO: Implement business logic
        // 1. Validate current state
        // 2. Apply business rules
        // 3. Update state
        result = PROCESS(params)'''
        
        elif method.type == 'query':
            return '''        // TODO: Implement query logic
        result = FETCH data based on criteria'''
        
        elif method.type == 'factory':
            return '''        // TODO: Implement creation logic
        entity = CREATE new entity with params
        result = entity'''
        
        return '''        // TODO: Implement logic
        result = PROCESS(params)'''
    
    def _generate_postconditions(self, method: Method) -> str:
        """Generate postcondition checks."""
        if method.returns == 'void':
            return "        // State updated"
        
        return f"        ENSURE result IS valid"
    
    def _generate_events(self, events: List[str]) -> str:
        """Generate event emission statements."""
        if not events:
            return ""
        
        lines = ["\n        // Emit domain events"]
        for event in events:
            lines.append(f"        EMIT {event}(")
            lines.append(f"            // Event data")
            lines.append(f"            timestamp: NOW()")
            lines.append(f"        )")
        
        return '\n'.join(lines)
    
    def _generate_index(self, files: Dict[str, str]) -> str:
        """Generate index file for all pseudocode."""
        lines = [
            "# Pseudocode Index",
            "",
            f"Generated: {datetime.now().isoformat()}",
            "",
            "## Files",
            "",
            "| File | Type | Methods |",
            "|------|------|---------|"
        ]
        
        for filename, content in files.items():
            if filename == 'INDEX.md':
                continue
            
            file_type = 'Aggregate' if 'AGGREGATE' in content else 'Service'
            method_count = content.count('FUNCTION ')
            lines.append(f"| {filename} | {file_type} | {method_count} |")
        
        lines.extend([
            "",
            "## Usage with Claude Code",
            "",
            "```bash",
            "# Implement specific aggregate",
            "claude \"Implement OrderAggregate from @docs/pseudocode/OrderAggregate.pseudo\"",
            "",
            "# Implement all",
            "claude \"Implement all aggregates from docs/pseudocode/ in TypeScript\"",
            "```"
        ])
        
        return '\n'.join(lines)
    
    def _write_file(self, filename: str, content: str):
        """Write content to file."""
        filepath = self.output_dir / filename
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Generated: {filepath}")


def main():
    parser = argparse.ArgumentParser(
        description='Generate pseudocode from DDD tactical design'
    )
    parser.add_argument(
        '--input', '-i',
        type=Path,
        required=True,
        help='Input JSON file with tactical design'
    )
    parser.add_argument(
        '--output', '-o',
        type=Path,
        default=Path('docs/pseudocode'),
        help='Output directory for pseudocode files'
    )
    
    args = parser.parse_args()
    
    generator = PseudocodeGenerator(args.output)
    files = generator.generate_from_json(args.input)
    
    print(f"\nGenerated {len(files)} files in {args.output}")


if __name__ == '__main__':
    main()
