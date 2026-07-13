# One-shot codemod for the anti-dopamine retheme (step 3).
# Sweeps hardcoded colors/radii/weights in styles.css (everything BEFORE the
# token layer) and inline colors in main.js onto the design tokens.
import re

CSS = "public/styles.css"
JS = "src/app/main.js"
MARKER = "ANTI-DOPAMINE THEME"

css = open(CSS).read()
head, marker, tail = css.partition(f"/* {'='*74}\n   {MARKER}")
assert marker, "token layer marker not found"

counts = {}

def sub(pattern, repl, flags=0):
    global head
    head, n = re.subn(pattern, repl, head, flags=flags)
    counts[pattern[:60]] = counts.get(pattern[:60], 0) + n

# --- 0. Targeted fixes before generic maps -------------------------------
# Today ring on the activity heatmap: clay highlight instead of white.
sub(r"\.activity-day\.today \{\n  box-shadow: [^;]+;", ".activity-day.today {\n  box-shadow: inset 0 0 0 1.5px var(--accent-2);")
# Calendar-profile today ring likewise.
sub(r"\.profile-calendar-day\.today \{\n  box-shadow: [^;]+;", ".profile-calendar-day.today {\n  box-shadow: inset 0 0 0 1.5px var(--accent-2);")
# Gauge sheen: flat subtle fill, no radial gradient.
sub(r"background: radial-gradient\(circle at 40% 35%, rgba\(255, 255, 255, 0\.1\), rgba\(255, 255, 255, 0\.03\) 70%\);", "background: var(--fill-subtle);")
# Slider thumb: accent, not white.
sub(r"(slider-thumb \{[^}]*?)background: #fff;", r"\1background: var(--accent);", flags=re.S)
# Drop text shadows entirely.
sub(r"\n\s*text-shadow: [^;]+;", "")

# --- 1. Filled CTA pairs: light bg + dark text -> accent + on-accent ------
light_bg = r"#(?:ececec|e5e5ea|e6e6e9|f4f4f5|f5f5f7|fff|ffffff)"
dark_fg = r"#(?:0b0b0c|161618|1c1c1e|000000|000|111|0d0e10)"
sub(rf"background: {light_bg}( !important)?;(\s*)color: {dark_fg}( !important)?;",
    r"background: var(--accent)\1;\2color: var(--on-accent)\3;")
sub(rf"color: {dark_fg}( !important)?;(\s*)background: {light_bg}( !important)?;",
    r"color: var(--on-accent)\1;\2background: var(--accent)\3;")
# Success-filled pills keep readable text.
sub(r"background: #30d158 !important;\n  color: #fff !important;",
    "background: var(--success) !important;\n  color: var(--on-accent) !important;")

# --- 2. Box shadows -> hairline token ------------------------------------
sub(r"box-shadow: (?!var|none|inset)[^;]*rgba\(0, 0, 0,[^;]*( !important)?;",
    r"box-shadow: var(--shadow)\1;")

# --- 3. Single color tokens ----------------------------------------------
singles = [
    (r"#ececec\b", "var(--text)"), (r"#e5e5ea\b", "var(--text)"),
    (r"#e6e6e9\b", "var(--text)"), (r"#f4f4f5\b", "var(--text)"),
    (r"#f5f5f7\b", "var(--text)"), (r"#ffffff\b", "var(--text)"),
    (r"#fff\b", "var(--text)"),
    (r"#d1d1d6\b", "var(--text-2)"), (r"#c7c7cc\b", "var(--text-2)"),
    (r"#8e8e93\b", "var(--muted)"), (r"#a1a1a6\b", "var(--muted)"),
    (r"#9a9a9f\b", "var(--muted)"), (r"#86868b\b", "var(--muted)"),
    (r"#000000\b", "var(--bg)"), (r"#0b0b0c\b", "var(--bg)"),
    (r"#0d0e10\b", "var(--bg)"), (r"#0d0e11\b", "var(--bg)"),
    (r"#050506\b", "var(--bg)"), (r"#0d0d0d\b", "var(--bg)"),
    (r"#101011\b", "var(--bg)"), (r"#141415\b", "var(--bg)"),
    (r"#16171a\b", "var(--bg)"), (r"#0f0f10\b", "var(--bg)"),
    (r"#000\b", "var(--bg)"),
    (r"#161618\b", "var(--surface)"), (r"#1c1c1e\b", "var(--surface)"),
    (r"#232326\b", "var(--surface-2)"), (r"#2c2c2e\b", "var(--surface-2)"),
    (r"#202023\b", "var(--line)"),
    (r"#30d158\b", "var(--success)"), (r"#32d74b\b", "var(--success)"),
    (r"#1e9e47\b", "var(--success)"),
    (r"#0a84ff\b", "var(--accent)"),
    (r"#ff9f0a\b", "var(--accent-2)"), (r"#ff9500\b", "var(--accent-2)"),
    (r"#ff453a\b", "var(--error)"), (r"#ff3b30\b", "var(--error)"),
    (r"#ffd60a\b", "var(--warning)"),
    (r"#1c2e20\b", "color-mix(in srgb, var(--success) 18%, var(--surface))"),
    (r"#3a1d1c\b", "color-mix(in srgb, var(--error) 18%, var(--surface))"),
    (r"#031423\b", "color-mix(in srgb, var(--accent) 18%, var(--surface))"),
    (r"rgba\(22, 22, 24, [0-9.]+\)", "var(--surface)"),
    (r"rgba\(28, 28, 30, [0-9.]+\)", "var(--surface)"),
    (r"rgba\(120, 120, 128, [0-9.]+\)", "var(--surface-2)"),
]
for pattern, repl in singles:
    sub(pattern, repl, flags=re.I)

# --- 4. White-alpha buckets ----------------------------------------------
def alpha_repl(match):
    a = float(match.group(1))
    if a >= 0.6: return "var(--text)"
    if a >= 0.2: return "var(--line-strong)"
    if a >= 0.055: return "var(--line)"
    return "var(--fill-subtle)"
head, n = re.subn(r"rgba\(255, 255, 255, ([0-9.]+)\)", alpha_repl, head)
counts["rgba255 buckets"] = n

# --- 5. Radii -------------------------------------------------------------
sub(r"border-radius: 22px 0 0 22px", "border-radius: var(--radius) 0 0 var(--radius)")
sub(r"border-radius: 999px", "border-radius: var(--radius)")
sub(r"border-radius: (?:9|1[0-9]|2[0-8])px\b", "border-radius: var(--radius)")

# --- 6. Weights ------------------------------------------------------------
sub(r"font-weight: (?:6[5-9]\d|[7-9]\d\d)( !important)?;", r"font-weight: 600\1;")
sub(r"font-weight: 590( !important)?;", r"font-weight: 500\1;")
sub(r"font: 700 ", "font: 600 ")

# --- 7. Spacing: unhurried (~25% up on common card paddings/gaps) ----------
spacing = [
    ("padding: 28px;", "padding: 34px;"), ("padding: 24px;", "padding: 30px;"),
    ("padding: 22px;", "padding: 27px;"), ("padding: 20px;", "padding: 25px;"),
    ("padding: 18px;", "padding: 22px;"), ("padding: 16px;", "padding: 20px;"),
    ("padding: 14px 16px;", "padding: 18px 20px;"),
    ("padding: 13px 14px;", "padding: 16px 18px;"),
    ("padding: 12px 14px;", "padding: 15px 18px;"),
    ("gap: 18px;", "gap: 22px;"), ("gap: 16px;", "gap: 20px;"),
    ("gap: 14px;", "gap: 17px;"), ("gap: 12px;", "gap: 15px;"),
]
for old, new in spacing:
    counts[old] = head.count(old)
    head = head.replace(old, new)

open(CSS, "w").write(head + marker + tail)

# --- main.js ---------------------------------------------------------------
js = open(JS).read()
js_pairs = [
    ('#30d158', 'var(--success)'),
    ('#0a84ff', 'var(--accent)'),
    ('#ff9f0a', 'var(--accent-2)'),
    ('#ececec', 'var(--text)'),
    ('rgba(48, 209, 88, 0.32)', 'color-mix(in srgb, var(--success) 30%, transparent)'),
    ('rgba(255, 255, 255, 0.16)', 'var(--surface-2)'),
    ('rgba(255, 255, 255, 0.5)', 'var(--accent-2)'),
    ('rgba(255, 255, 255, 0.4)', 'var(--line-strong)'),
    ('rgba(255, 255, 255, 0.35)', 'var(--line-strong)'),
    ('rgba(255, 255, 255, 0.18)', 'var(--line)'),
    ('rgba(255, 255, 255, 0.12)', 'var(--line)'),
    ('rgba(255, 255, 255, 0.08)', 'var(--line)'),
    ('rgba(255, 255, 255, 0.07)', 'var(--fill-subtle)'),
]
for old, new in js_pairs:
    counts[f"js {old}"] = js.count(old)
    js = js.replace(old, new)

# Muted health ring + calendar ramp via tokens.
old_shade = 'return `hsl(135, ${Math.round(60 + level * 20)}%, ${Math.round(18 + level * 37)}%)`;'
new_shade = 'return `color-mix(in srgb, var(--success) ${Math.round(30 + level * 70)}%, var(--surface-2))`;'
assert js.count(old_shade) == 1
js = js.replace(old_shade, new_shade)

old_ring = 'return `hsl(${Math.round(clamp01(health / 100) * 120)}, 85%, 52%)`;'
new_ring = 'return `hsl(${Math.round(clamp01(health / 100) * 120)}, 32%, 46%)`;'
assert js.count(old_ring) == 1
js = js.replace(old_ring, new_ring)

# No glow effects: drop the aura layer behind the home head.
old_glow = """  const glowHue = Math.round(t * 120);
  return `
    <i class="home-health-glow" style="background: radial-gradient(circle, hsla(${glowHue}, 85%, 52%, 0.5) 0%, hsla(${glowHue}, 85%, 52%, 0) 70%)"></i>
"""
new_glow = """  return `
"""
assert js.count(old_glow) == 1
js = js.replace(old_glow, new_glow)

open(JS, "w").write(js)

for key, n in sorted(counts.items(), key=lambda item: -item[1]):
    if n: print(f"{n:4d}  {key}")
print("\nremaining gradients in swept region:")
for line in head.splitlines():
    if "gradient(" in line:
        print("   ", line.strip()[:110])
