#!/usr/bin/env python3
"""Archive a conversation JSONL transcript to readable markdown."""
import json, sys, os
from datetime import datetime

def main():
    if len(sys.argv) < 2:
        print("Uso: archive_conversation.py <transcript.jsonl>")
        sys.exit(1)

    transcript_path = sys.argv[1]
    if not os.path.exists(transcript_path):
        print(f"ERROR: no existe {transcript_path}")
        sys.exit(1)

    # Read transcript
    messages = []
    with open(transcript_path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                messages.append(entry)
            except json.JSONDecodeError:
                continue

    # Build markdown
    ts = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    lines = []
    lines.append(f"# Conversación — {ts}\n")
    lines.append(f"_{len(messages)} mensajes, {len(sys.argv) > 2 and sys.argv[2] or 'sin etiqueta'}_\n")
    lines.append("---\n")

    for msg in messages:
        role = msg.get("role", "?")
        content = msg.get("content", "")
        # Truncate long content
        if len(content) > 2000:
            content = content[:2000] + "\n\n_[...truncado...]_"
        lines.append(f"**{role.upper()}:**\n{content}\n")

    # Write output
    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "conversations")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"conv_{ts}.md")

    with open(out_path, "w") as f:
        f.write("\n".join(lines))

    print(f"SAVED:{out_path}")
    print(f"OK:{len(messages)} mensajes archivados")

if __name__ == "__main__":
    main()
