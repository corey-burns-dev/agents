import os
import re

replacements = [
    (re.compile(r'agentz', re.IGNORECASE), {
        'agentz': 'agents',
        'Agentz': 'Agents',
        'AGENTZ': 'AGENTS',
    }),
    (re.compile(r't3code', re.IGNORECASE), {
        't3code': 'agents',
        'T3Code': 'Agents',
        'T3CODE': 'AGENTS',
    }),
    (re.compile(r'\bt3\b', re.IGNORECASE), {
        't3': 'agents',
        'T3': 'Agents',
    })
]

def get_replacement(match, mapping):
    text = match.group(0)
    # Check exact match first
    if text in mapping:
        return mapping[text]
    
    # Check lowercase match
    lower_text = text.lower()
    replacement = mapping.get(lower_text, 'agents')
    
    # Smart casing
    if text.isupper():
        return replacement.upper()
    if text[0].isupper():
        return replacement.capitalize()
    return replacement

with open('files_to_replace.txt', 'r', encoding='utf-8') as f:
    files = [line.strip() for line in f if line.strip()]

for file_path in files:
    if not os.path.isfile(file_path):
        continue
        
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        new_content = content
        for pattern, mapping in replacements:
            new_content = pattern.sub(lambda m: get_replacement(m, mapping), new_content)
        
        if new_content != content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated {file_path}")
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
