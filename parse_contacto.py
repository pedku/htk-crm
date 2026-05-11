#!/usr/bin/env python3
"""Parse existing contacto data to populate url, telefono, email columns. v4 - final fixes."""
import re
import sqlite3

conn = sqlite3.connect('/home/peku/htk-crm/htk_crm.db')
c = conn.cursor()

phone_re = re.compile(r'\+?\d{1,4}[\s-]?\(?\d{1,4}\)?[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{1,4}')
email_re = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
url_re = re.compile(r'(https?://[^\s|)]+|www\.[^\s|)]+|[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}(/[^\s|)]*)?)')

def clean_phone(p):
    cleaned = re.sub(r'[^\d+]', '', p)
    if re.match(r'^\+?0\d', cleaned):
        cleaned = re.sub(r'^\+?0', '', cleaned)
        if not cleaned.startswith('+'):
            cleaned = '+' + cleaned if cleaned.startswith('57') and len(cleaned) >= 10 else cleaned
    return cleaned

def is_valid_phone(s):
    digits = re.sub(r'\D', '', s)
    return len(digits) >= 7

def is_url_candidate(s):
    """Check if a string looks like a URL (not an email, not a social handle)."""
    s = s.strip()
    if s.startswith('@'):
        return False
    if '@' in s:
        return False
    # Must have a domain-like pattern
    if re.search(r'\.[a-zA-Z]{2,}(/|$|\s)', s):
        return True
    if s.startswith(('http://', 'https://', 'www.')):
        return True
    return False

rows = c.execute("SELECT id, contacto FROM leads").fetchall()

for lead_id, contacto in rows:
    phone_found = None
    email_found = None
    url_found = None

    if not contacto or not contacto.strip():
        conn.execute("UPDATE leads SET url = '', telefono = '', email = '' WHERE id = ?", (lead_id,))
        continue

    # Find all emails first from the full contacto
    all_emails = [m.group(0) for m in email_re.finditer(contacto)]
    if all_emails:
        email_found = all_emails[0]

    # Split by pipe delimiters
    parts = re.split(r'\s*\|\s*', contacto)

    for part in parts:
        part = part.strip()
        if not part:
            continue

        # Detect label
        label_match = re.match(r'^(Web|Tel(é|e)fono|WA|WhatsApp|Email|Formulario|Facebook|Instagram|Dirección|PBX|Tel)\s*[:.]?\s*', part, re.IGNORECASE)
        label = label_match.group(1).lower() if label_match else ''
        content = re.sub(r'^(Web|Tel(é|e)fono|WA|WhatsApp|Email|Formulario|Facebook|Instagram|Dirección|PBX|Tel)\s*[:.]?\s*', '', part, flags=re.IGNORECASE).strip()

        if label in ('web', 'formulario'):
            # Definitely a URL
            if not url_found:
                # Strip parenthetical notes
                content = re.sub(r'\s*\(.*?\)\s*', '', content).strip()
                content = content.rstrip('.,;:|')
                if content and not content.startswith('@'):
                    if not content.startswith('http'):
                        content = 'http://' + content
                    url_found = content

        elif label in ('facebook', 'instagram'):
            # Social media - skip URL extraction to avoid @handles
            pass

        elif label in ('email',):
            # Already captured via global regex
            pass

        elif label in ('tel', 'teléfono', 'telefono', 'wa', 'whatsapp', 'pbx'):
            # Look for phone number
            if not phone_found:
                phone_matches = phone_re.findall(content)
                for pm in phone_matches:
                    cleaned = clean_phone(pm)
                    if is_valid_phone(cleaned):
                        if not phone_found or len(cleaned) > len(clean_phone(phone_found)):
                            phone_found = cleaned

        else:
            # No recognized label - auto-detect
            m = email_re.search(content)
            if m and not email_found:
                email_found = m.group(0)

            if not url_found and is_url_candidate(content) and '@' not in content and not content.startswith('@'):
                m = url_re.search(content)
                if m:
                    cand = m.group(0).rstrip('.,;:|')
                    if not cand.startswith('http'):
                        cand = 'http://' + cand
                    url_found = cand

            if not phone_found and '@' not in content:
                phone_matches = phone_re.findall(content)
                for pm in phone_matches:
                    cleaned = clean_phone(pm)
                    if is_valid_phone(cleaned):
                        if not phone_found or len(cleaned) > len(clean_phone(phone_found)):
                            phone_found = cleaned

    # Clean phone: prefer +57 format, remove duplicates
    if phone_found:
        # Remove malformed +5700 prefixes
        phone_found = re.sub(r'^\+5700', '+57', phone_found)
        phone_found = re.sub(r'^\+5700', '+57', phone_found)  # in case double
        # If it starts with 57 and has no +, add it
        if phone_found.startswith('57') and len(phone_found) >= 10 and not phone_found.startswith('+'):
            phone_found = '+' + phone_found

    conn.execute("UPDATE leads SET url = ?, telefono = ?, email = ? WHERE id = ?",
                 (url_found or '', phone_found or '', email_found or '', lead_id))

conn.commit()

# Verification
print("=== Verification ===")
c.execute("SELECT id, url, telefono, email FROM leads ORDER BY id")
for row in c.fetchall():
    print(f"{row[0]}: url={row[1]!r}, tel={row[2]!r}, email={row[3]!r}")

conn.close()
print("\nDone!")
