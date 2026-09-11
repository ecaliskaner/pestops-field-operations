"""Static check: does any module reference an exported symbol it never imports?

Catches latent breakage in code paths the browser test did not exercise.

The match deliberately runs over code only, and only over genuine *uses*.
Without that, the check degenerates into a substring search over the whole
file and fires on any mention of a name. Three kinds of false report came out
of that, and together they produced 57 phantom findings that made a real one
impossible to spot:

  - a symbol discussed in a comment    (`repo/customer.js` "uses state")
  - a local binding of the same name   (`core/supabase.js` has `const raw`,
                                        `views/finance.js` has a `html` param)
  - an object-literal key              (`{ state: 'risk' }`, Leaflet's
                                        `{ html: '<div>' }`)
"""
import io, re, glob

BLANK = lambda m: ' ' * len(m.group(0))


def strip_noncode(src):
    """Blank out comments and string/template literals, preserving offsets."""
    src = re.sub(r'/\*.*?\*/', BLANK, src, flags=re.S)          # block comment
    src = re.sub(r'//[^\n]*', BLANK, src)                       # line comment
    src = re.sub(r'`(?:\\.|[^`\\])*`', BLANK, src, flags=re.S)  # template literal
    src = re.sub(r"'(?:\\.|[^'\\\n])*'", BLANK, src)            # single-quoted
    src = re.sub(r'"(?:\\.|[^"\\\n])*"', BLANK, src)            # double-quoted
    return src


def declared_locally(body, sym):
    """True when the file binds `sym` itself, so the match is its own.

    Covers declarations and parameter lists: a parameter that happens to share
    a name with another module's export is not a missing import.
    """
    if re.search(r'(?:const|let|var|function|class)\s+' + re.escape(sym) + r'\b', body):
        return True
    param_lists = re.findall(r'function\s*[\w$]*\s*\(([^)]*)\)', body)
    param_lists += re.findall(r'\(([^)]*)\)\s*=>', body)
    for params in param_lists:
        names = [x.strip().split('=')[0].strip() for x in params.split(',')]
        if sym in names:
            return True
    return False


def is_property_key(body, pos, sym):
    """True when this occurrence is an object-literal key (`html: ...`)."""
    if not re.match(r'\s*:', body[pos + len(sym):]):
        return False
    # A ternary branch (`cond ? html : x`) is a real use, not a key.
    return not body[:pos].rstrip().endswith('?')


files = sorted(p.replace('\\', '/') for p in glob.glob('src/**/*.js', recursive=True))

exports = {}
for f in files:
    s = io.open(f, encoding='utf8').read()
    ns = set(re.findall(r'^export (?:function|const|let)\s+([A-Za-z_$][\w$]*)', s, re.M))
    # dom.js exports `$` and `$$`, which the identifier regex above skips
    ns |= {m for m in re.findall(r'^export const (\$\$?)\s*=', s, re.M)}
    exports[f] = ns

owner = {}
for f, ns in exports.items():
    for n in ns:
        owner[n] = f

problems = []
for f in files:
    s = io.open(f, encoding='utf8').read()
    imported = set()
    for m in re.finditer(r'import\s*\{([^}]*)\}\s*from', s):
        imported |= {x.strip() for x in m.group(1).split(',') if x.strip()}
    body = strip_noncode(re.sub(r'^import .*$', '', s, flags=re.M))
    for sym, src in owner.items():
        if src == f or sym in exports[f] or sym in imported:
            continue
        if sym == '$':
            pat = r'(?<![\w$])\$\('
        elif sym == '$$':
            pat = r'(?<![\w$])\$\$\('
        else:
            pat = r'(?<![\w$.])' + re.escape(sym) + r'\b'
        real_use = next(
            (m for m in re.finditer(pat, body) if not is_property_key(body, m.start(), sym)),
            None
        )
        if real_use and not declared_locally(body, sym):
            problems.append((f, sym, src))

print('files scanned:', len(files))
print('MISSING IMPORTS:', len(problems))
for f, sym, src in problems:
    print('  %-30s uses %-26s (exported by %s)' % (f, sym, src))

raise SystemExit(1 if problems else 0)
