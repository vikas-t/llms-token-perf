#!/usr/bin/env python3
"""
Check which model (Opus vs Sonnet) was used for each experiment and language.
This is CRITICAL for fair comparison - if different languages used different models,
the comparison is invalid.
"""

import json
from pathlib import Path
from collections import defaultdict

def analyze_session_models(jsonl_file):
    """Extract model usage from a session file."""
    model_tokens = defaultdict(lambda: {
        'output_tokens': 0,
        'total': 0,
        'messages': 0
    })

    try:
        with open(jsonl_file, 'r') as f:
            for line in f:
                try:
                    entry = json.loads(line)

                    if 'message' in entry and 'usage' in entry['message']:
                        model = entry['message'].get('model', 'unknown')
                        usage = entry['message']['usage']

                        model_tokens[model]['output_tokens'] += usage.get('output_tokens', 0)
                        model_tokens[model]['total'] += (
                            usage.get('input_tokens', 0) +
                            usage.get('output_tokens', 0) +
                            usage.get('cache_read_input_tokens', 0) +
                            usage.get('cache_creation_input_tokens', 0)
                        )
                        model_tokens[model]['messages'] += 1

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
    """Analyze model usage per experiment and language."""
    experiments = [
        'kvstore-3', 'kvstore-4', 'kvstore-5',
        'graphlib-1', 'graphlib-2', 'graphlib-3',
        'diffmerge-1', 'diffmerge-2', 'diffmerge-3',
        'minigit-3', 'minigit-4', 'minigit-5'
    ]

    results = {}

    for exp in experiments:
        print(f"\n{'='*80}")
        print(f"Experiment: {exp}")
        print(f"{'='*80}")

        exp_results = {}

        for lang in ['py', 'ts', 'go']:
            session_files = get_all_session_files(exp, lang)

            if not session_files:
                print(f"  {lang}: NO SESSION FILES FOUND")
                continue

            # Aggregate across all sessions
            total_model_tokens = defaultdict(lambda: {
                'output_tokens': 0,
                'total': 0,
                'messages': 0
            })

            for session_file in session_files:
                model_tokens = analyze_session_models(session_file)
                for model, tokens in model_tokens.items():
                    for key in tokens:
                        total_model_tokens[model][key] += tokens[key]

            # Determine dominant model
            dominant_model = None
            max_tokens = 0
            for model, data in total_model_tokens.items():
                if data['total'] > max_tokens:
                    max_tokens = data['total']
                    dominant_model = model

            exp_results[lang] = {
                'models': dict(total_model_tokens),
                'dominant': dominant_model
            }

            # Print summary
            print(f"\n  {lang}:")
            for model, data in sorted(total_model_tokens.items()):
                percentage = (data['total'] / max_tokens * 100) if max_tokens > 0 else 0
                print(f"    {model}:")
                print(f"      Total tokens: {data['total']:,} ({percentage:.1f}%)")
                print(f"      Output tokens: {data['output_tokens']:,}")
                print(f"      Messages: {data['messages']}")
            print(f"    → Dominant model: {dominant_model}")

        results[exp] = exp_results

        # Check if all languages used the same dominant model
        dominant_models = {lang: data['dominant'] for lang, data in exp_results.items()}
        if len(set(dominant_models.values())) == 1:
            print(f"\n  ✓ FAIR COMPARISON: All languages used {list(dominant_models.values())[0]}")
        else:
            print(f"\n  ⚠️  WARNING: Languages used DIFFERENT models!")
            for lang, model in dominant_models.items():
                print(f"      {lang}: {model}")

    # Save detailed results
    output_file = 'model_usage_per_experiment.json'
    with open(output_file, 'w') as f:
        # Convert defaultdict to regular dict for JSON serialization
        serializable = {}
        for exp, exp_data in results.items():
            serializable[exp] = {}
            for lang, lang_data in exp_data.items():
                serializable[exp][lang] = {
                    'models': {model: dict(tokens) for model, tokens in lang_data['models'].items()},
                    'dominant': lang_data['dominant']
                }
        json.dump(serializable, f, indent=2)

    print(f"\n{'='*80}")
    print(f"✓ Detailed results saved to {output_file}")
    print(f"{'='*80}")

    # Print summary table
    print("\n\nSUMMARY TABLE:")
    print("\n| Experiment | Python | TypeScript | Go | Fair? |")
    print("|------------|--------|------------|-----|-------|")
    for exp in experiments:
        if exp not in results:
            continue
        exp_data = results[exp]
        py_model = exp_data.get('py', {}).get('dominant', 'N/A')
        ts_model = exp_data.get('ts', {}).get('dominant', 'N/A')
        go_model = exp_data.get('go', {}).get('dominant', 'N/A')

        # Extract short model name
        py_short = 'Opus' if 'opus' in py_model.lower() else 'Sonnet' if 'sonnet' in py_model.lower() else py_model
        ts_short = 'Opus' if 'opus' in ts_model.lower() else 'Sonnet' if 'sonnet' in ts_model.lower() else ts_model
        go_short = 'Opus' if 'opus' in go_model.lower() else 'Sonnet' if 'sonnet' in go_model.lower() else go_model

        all_same = len({py_short, ts_short, go_short}) == 1
        fair = "✓" if all_same else "⚠️"

        print(f"| {exp} | {py_short} | {ts_short} | {go_short} | {fair} |")

if __name__ == '__main__':
    main()
