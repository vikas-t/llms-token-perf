#!/usr/bin/env python3
"""
Analyze which models (Opus vs Sonnet) were used and their token contributions.
"""

import json
from pathlib import Path
from collections import defaultdict

def analyze_session_models(jsonl_file):
    """Extract model usage from a session file."""
    model_tokens = defaultdict(lambda: {
        'input_tokens': 0,
        'output_tokens': 0,
        'cache_read_input_tokens': 0,
        'cache_creation_input_tokens': 0,
        'total': 0
    })

    try:
        with open(jsonl_file, 'r') as f:
            for line in f:
                try:
                    entry = json.loads(line)

                    if 'message' in entry and 'usage' in entry['message']:
                        model = entry['message'].get('model', 'unknown')
                        usage = entry['message']['usage']

                        model_tokens[model]['input_tokens'] += usage.get('input_tokens', 0)
                        model_tokens[model]['output_tokens'] += usage.get('output_tokens', 0)
                        model_tokens[model]['cache_read_input_tokens'] += usage.get('cache_read_input_tokens', 0)
                        model_tokens[model]['cache_creation_input_tokens'] += usage.get('cache_creation_input_tokens', 0)

                        total = (usage.get('input_tokens', 0) +
                                usage.get('output_tokens', 0) +
                                usage.get('cache_read_input_tokens', 0) +
                                usage.get('cache_creation_input_tokens', 0))
                        model_tokens[model]['total'] += total

                except json.JSONDecodeError:
                    continue

    except Exception as e:
        print(f"Error reading {jsonl_file}: {e}")

    return model_tokens

def get_all_session_files(experiment_name, language):
    """Get all session jsonl files for a given experiment and language."""
    base_dir = Path.home() / ".claude" / "projects"
    project_dir = base_dir / f"-Users-vikas-t-ws-nq-llms-tokens-perf-{experiment_name}-{language}"

    if not project_dir.exists():
        return []

    return list(project_dir.glob("*.jsonl"))

def main():
    """Analyze model usage across all experiments."""
    experiments = [
        'minigit-3', 'minigit-4', 'minigit-5',
        'diffmerge-1', 'diffmerge-2', 'diffmerge-3',
        'graphlib-1', 'graphlib-2', 'graphlib-3',
        'kvstore-3', 'kvstore-4', 'kvstore-5'
    ]

    # Aggregate across all experiments
    global_model_tokens = defaultdict(lambda: {
        'input_tokens': 0,
        'output_tokens': 0,
        'cache_read_input_tokens': 0,
        'cache_creation_input_tokens': 0,
        'total': 0
    })

    for exp in experiments:
        print(f"\nAnalyzing {exp}...")

        for lang in ['py', 'ts', 'go']:
            session_files = get_all_session_files(exp, lang)

            for session_file in session_files:
                model_tokens = analyze_session_models(session_file)

                # Aggregate into global totals
                for model, tokens in model_tokens.items():
                    for key in tokens:
                        global_model_tokens[model][key] += tokens[key]

    # Print results
    print("\n" + "="*80)
    print("OVERALL MODEL USAGE ACROSS ALL EXPERIMENTS")
    print("="*80)

    total_all_models = sum(data['total'] for data in global_model_tokens.values())

    for model in sorted(global_model_tokens.keys()):
        data = global_model_tokens[model]
        percentage = (data['total'] / total_all_models * 100) if total_all_models > 0 else 0

        print(f"\n{model}:")
        print(f"  Total tokens: {data['total']:,} ({percentage:.1f}%)")
        print(f"  Input: {data['input_tokens']:,}")
        print(f"  Output: {data['output_tokens']:,}")
        print(f"  Cache Read: {data['cache_read_input_tokens']:,}")
        print(f"  Cache Create: {data['cache_creation_input_tokens']:,}")

    print(f"\nGrand Total: {total_all_models:,} tokens")

    # Save detailed results
    output_file = 'model_usage_breakdown.json'
    with open(output_file, 'w') as f:
        # Convert defaultdict to regular dict for JSON serialization
        regular_dict = {model: dict(tokens) for model, tokens in global_model_tokens.items()}
        json.dump(regular_dict, f, indent=2)

    print(f"\n✓ Detailed results saved to {output_file}")

if __name__ == '__main__':
    main()
