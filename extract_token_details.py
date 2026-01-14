#!/usr/bin/env python3
"""
Extract detailed token breakdowns (input, output, cache_read, cache_creation)
from all experiment session files.
"""

import json
import os
from pathlib import Path
from collections import defaultdict

def get_session_files(experiment_name, language):
    """Get all session jsonl files for a given experiment and language."""
    base_dir = Path.home() / ".claude" / "projects"

    # Pattern: -Users-vikas-t-ws-nq-llms-tokens-perf-{experiment}-{lang}
    project_dir = base_dir / f"-Users-vikas-t-ws-nq-llms-tokens-perf-{experiment_name}-{language}"

    if not project_dir.exists():
        return []

    # Find all .jsonl files (session transcripts)
    jsonl_files = list(project_dir.glob("*.jsonl"))
    return jsonl_files

def extract_tokens_from_session(jsonl_file):
    """Extract all token usage from a session file."""
    tokens = {
        'input_tokens': 0,
        'output_tokens': 0,
        'cache_read_input_tokens': 0,
        'cache_creation_input_tokens': 0
    }

    try:
        with open(jsonl_file, 'r') as f:
            for line in f:
                try:
                    entry = json.loads(line)

                    # Look for usage data in the message
                    if 'message' in entry and 'usage' in entry['message']:
                        usage = entry['message']['usage']
                        tokens['input_tokens'] += usage.get('input_tokens', 0)
                        tokens['output_tokens'] += usage.get('output_tokens', 0)
                        tokens['cache_read_input_tokens'] += usage.get('cache_read_input_tokens', 0)
                        tokens['cache_creation_input_tokens'] += usage.get('cache_creation_input_tokens', 0)

                except json.JSONDecodeError:
                    continue

    except Exception as e:
        print(f"Error reading {jsonl_file}: {e}")

    return tokens

def analyze_experiment(experiment_name, languages=['py', 'ts', 'go']):
    """Analyze token usage for all languages in an experiment."""
    results = {}

    for lang in languages:
        session_files = get_session_files(experiment_name, lang)

        if not session_files:
            print(f"Warning: No session files found for {experiment_name}-{lang}")
            continue

        total_tokens = {
            'input_tokens': 0,
            'output_tokens': 0,
            'cache_read_input_tokens': 0,
            'cache_creation_input_tokens': 0
        }

        for session_file in session_files:
            session_tokens = extract_tokens_from_session(session_file)
            for key in total_tokens:
                total_tokens[key] += session_tokens[key]

        # Calculate total
        total = sum(total_tokens.values())

        results[lang] = {
            **total_tokens,
            'total': total,
            'session_count': len(session_files)
        }

    return results

def main():
    """Main analysis function."""
    experiments = [
        'minigit-3', 'minigit-4', 'minigit-5',
        'diffmerge-1', 'diffmerge-2', 'diffmerge-3',
        'graphlib-1', 'graphlib-2', 'graphlib-3',
        'kvstore-3', 'kvstore-4', 'kvstore-5'
    ]

    all_results = {}

    for exp in experiments:
        print(f"\nAnalyzing {exp}...")
        results = analyze_experiment(exp)
        all_results[exp] = results

        # Print summary for this experiment
        for lang, data in results.items():
            print(f"  {lang}: Total={data['total']:,} "
                  f"(in={data['input_tokens']:,}, "
                  f"out={data['output_tokens']:,}, "
                  f"cache_read={data['cache_read_input_tokens']:,}, "
                  f"cache_create={data['cache_creation_input_tokens']:,})")

    # Save detailed results
    output_file = 'token_breakdowns.json'
    with open(output_file, 'w') as f:
        json.dump(all_results, f, indent=2)

    print(f"\n✓ Detailed results saved to {output_file}")

    # Create markdown table
    print("\n" + "="*80)
    print("MARKDOWN TABLE FORMAT:")
    print("="*80)

    for exp in experiments:
        print(f"\n### {exp}")
        print("| Lang | Total | Input | Output | Cache Read | Cache Create |")
        print("|------|-------|-------|--------|------------|--------------|")

        for lang in ['py', 'ts', 'go']:
            if lang in all_results[exp]:
                data = all_results[exp][lang]
                print(f"| {lang} | {data['total']:,} | {data['input_tokens']:,} | "
                      f"{data['output_tokens']:,} | {data['cache_read_input_tokens']:,} | "
                      f"{data['cache_creation_input_tokens']:,} |")

if __name__ == '__main__':
    main()
