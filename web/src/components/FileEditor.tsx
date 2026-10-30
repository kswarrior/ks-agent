import { useEffect, useMemo, useRef, useState } from 'react'
import { Markdown } from './Markdown'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const KEYWORDS: Record<string, string[]> = {
  javascript: ['break','case','catch','class','const','continue','debugger','default','delete','do','else','export','extends','false','finally','for','function','if','import','in','instanceof','let','new','null','return','super','switch','this','throw','true','try','typeof','var','void','while','with','yield','await','async','static','get','set','of','from','as','implements','interface','package','private','protected','public','enum','type'],
  typescript: ['break','case','catch','class','const','continue','debugger','default','delete','do','else','export','extends','false','finally','for','function','if','import','in','instanceof','let','new','null','return','super','switch','this','throw','true','try','typeof','var','void','while','with','yield','await','async','static','get','set','of','from','as','implements','interface','package','private','protected','public','enum','type','namespace','module','declare','abstract','readonly','keyof','infer','unknown','any','never','string','number','boolean','bigint','symbol','is','asserts'],
  python: ['and','as','assert','break','class','continue','def','del','elif','else','except','False','finally','for','from','global','if','import','in','is','lambda','None','nonlocal','not','or','pass','raise','return','True','try','while','with','yield','async','await'],
  java: ['abstract','assert','boolean','break','byte','case','catch','char','class','const','continue','default','do','double','else','enum','extends','final','finally','float','for','goto','if','implements','import','instanceof','int','interface','long','native','new','package','private','protected','public','return','short','static','strictfp','super','switch','synchronized','this','throw','throws','transient','try','void','volatile','while','true','false','null','var','yield','record','sealed','permits'],
  go: ['break','case','chan','const','continue','default','defer','else','fallthrough','for','func','go','goto','if','import','interface','map','package','range','return','select','struct','switch','type','var','true','false','nil','iota','make','new','append','len','cap'],
  rust: ['as','break','const','continue','crate','else','enum','extern','false','fn','for','if','impl','in','let','loop','match','mod','move','mut','pub','ref','return','self','Self','static','struct','super','trait','true','type','unsafe','use','where','while','async','await','dyn','abstract','become','box','do','final','macro','override','priv','typeof','unsized','virtual','yield','try','union'],
  php: ['__halt_compiler','abstract','and','array','as','break','callable','case','catch','class','clone','const','continue','declare','default','die','do','echo','else','elseif','empty','enddeclare','endfor','endforeach','endif','endswitch','endwhile','eval','exit','extends','final','finally','for','foreach','function','global','goto','if','implements','include','include_once','instanceof','insteadof','interface','isset','list','namespace','new','or','print','private','protected','public','require','require_once','return','static','switch','throw','trait','try','unset','use','var','while','xor','yield','true','false','null'],
  ruby: ['alias','and','begin','break','case','class','def','defined','do','else','elsif','end','ensure','false','for','if','in','module','next','nil','not','or','redo','rescue','retry','return','self','super','then','true','undef','unless','until','when','while','yield','__ENCODING__','__LINE__','__FILE__'],
  shell: ['if','then','else','elif','fi','case','esac','for','while','until','do','done','in','function','select','time','coproc','declare','export','local','readonly'],
  yaml: ['true','false','null','yes','no','on','off'],
  css: [],
  json: ['true','false','null'],
  html: [],
  xml: [],
  sql: ['select','from','where','insert','into','values','update','set','delete','create','table','alter','drop','index','view','join','inner','left','right','outer','on','group','by','having','order','asc','desc','limit','offset','union','all','distinct','as','and','or','not','null','is','in','exists','between','like','case','when','then','else','end','primary','key','foreign','references','constraint','unique','check','default'],
  c: ['auto','break','case','char','const','continue','default','do','double','else','enum','extern','float','for','goto','if','inline','int','long','register','restrict','return','short','signed','sizeof','static','struct','switch','typedef','union','unsigned','void','volatile','while','_Bool','_Complex','_Imaginary','true','false','NULL'],
  cpp: ['alignas','alignof','and','and_eq','asm','auto','bitand','bitor','bool','break','case','catch','char','char8_t','char16_t','char32_t','class','compl','concept','const','consteval','constexpr','constinit','const_cast','continue','co_await','co_return','co_yield','decltype','default','delete','do','double','dynamic_cast','else','enum','explicit','export','extern','false','float','for','friend','goto','if','inline','int','long','mutable','namespace','new','noexcept','not','not_eq','nullptr','operator','or','or_eq','private','protected','public','register','reinterpret_cast','requires','return','short','signed','sizeof','static','static_assert','static_cast','struct','switch','template','this','thread_local','throw','true','try','typedef','typeid','typename','union','unsigned','using','virtual','void','volatile','wchar_t','while','xor','xor_eq'],
  csharp: ['abstract','as','base','bool','break','byte','case','catch','char','checked','class','const','continue','decimal','default','delegate','do','double','else','enum','event','explicit','extern','false','finally','fixed','float','for','foreach','goto','if','implicit','in','int','interface','internal','is','lock','long','namespace','new','null','object','operator','out','override','params','private','protected','public','readonly','ref','return','sbyte','sealed','short','sizeof','stackalloc','static','string','struct','switch','this','throw','true','try','typeof','uint','ulong','unchecked','unsafe','ushort','using','virtual','void','volatile','while','add','alias','ascending','async','await','by','descending','dynamic','equals','from','get','global','group','into','join','let','nameof','on','orderby','partial','remove','select','set','value','var','when','where','yield'],
  swift: ['class','deinit','enum','extension','func','import','init','inout','internal','let','operator','private','protocol','public','static','struct','subscript','typealias','var','break','case','continue','default','defer','do','else','fallthrough','for','guard','if','in','repeat','return','switch','where','while','as','Any','catch','false','is','nil','rethrows','super','self','Self','throw','throws','true','try','associativity','convenience','dynamic','didSet','final','get','infix','indirect','lazy','left','mutating','none','nonmutating','optional','override','postfix','precedence','prefix','Protocol','required','right','set','Type','unowned','weak','willSet'],
  kotlin: ['as','break','class','continue','do','else','false','for','fun','if','in','interface','is','null','object','package','return','super','this','throw','true','try','typealias','val','var','when','while','by','catch','constructor','delegate','dynamic','field','file','finally','get','import','init','param','property','receiver','set','setparam','where','actual','abstract','annotation','companion','const','crossinline','data','enum','expect','external','final','infix','inline','inner','internal','lateinit','noinline','open','operator','out','override','private','protected','public','reified','sealed','suspend','tailrec','vararg'],
  dart: ['abstract','as','assert','async','await','break','case','catch','class','const','continue','covariant','default','deferred','do','dynamic','else','enum','export','extends','extension','external','factory','false','final','finally','for','Function','get','hide','if','implements','import','in','interface','is','late','library','mixin','new','null','on','operator','part','required','rethrow','return','set','show','static','super','switch','sync','this','throw','true','try','typedef','var','void','while','with','yield']
}

const LANGUAGES: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  ini: 'toml',
  json: 'json',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  css: 'css',
  scss: 'scss',
  less: 'less',
  sql: 'sql',
  kt: 'kotlin',
  swift: 'swift',
  dart: 'dart',
  md: 'markdown',
  markdown: 'markdown'
}

export function languageFor(path: string): string {
  const name = path.split('/').pop()?.toLowerCase() ?? ''
  if (name === 'dockerfile') return 'dockerfile'
  if (name === 'makefile') return 'makefile'
  const extension = name.includes('.') ? name.split('.').pop() ?? '' : ''
  return LANGUAGES[extension] ?? 'text'
}

export function isMarkdownPath(path: string): boolean {
  const lang = languageFor(path)
  return lang === 'markdown'
}

function highlightCode(code: string, lang: string): string {
  if (!code) return ''
  const placeholders: string[] = []
  const store = (value: string, className: string) => {
    const token = `__KS_HL_${placeholders.length}__KS__`
    placeholders.push(`<span class="${className}">${escapeHtml(value)}</span>`)
    return token
  }
  let working = code
  working = working.replace(/`(?:\\.|[^`\\])*`/g, (match) => store(match, 'hl-string'))
  working = working.replace(/"(?:\\.|[^"\\])*"/g, (match) => store(match, 'hl-string'))
  working = working.replace(/'(?:\\.|[^'\\])*'/g, (match) => store(match, 'hl-string'))
  working = working.replace(/\/\/.*$/gm, (match) => store(match, 'hl-comment'))
  if (['python', 'shell', 'yaml', 'toml', 'dockerfile', 'makefile', 'ruby'].includes(lang)) {
    working = working.replace(/#.*$/gm, (match) => store(match, 'hl-comment'))
  }
  working = working.replace(/\/\*[\s\S]*?\*\//g, (match) => store(match, 'hl-comment'))
  working = working.replace(/<!--[\s\S]*?-->/g, (match) => store(match, 'hl-comment'))
  working = working.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const keywords = KEYWORDS[lang]
  if (keywords && keywords.length > 0) {
    const pattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g')
    working = working.replace(pattern, '<span class="hl-keyword">$1</span>')
  }
  working = working.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="hl-number">$1</span>')
  working = working.replace(/\b([A-Za-z_]\w*)\s*(?=\()/g, '<span class="hl-function">$1</span>')
  if (lang === 'html' || lang === 'xml') {
    working = working.replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="hl-tag">$2</span>')
    working = working.replace(/\b([\w-:]+)(=)/g, '<span class="hl-attr">$1</span>$2')
  }
  if (lang === 'css' || lang === 'scss' || lang === 'less') {
    working = working.replace(/^(\s*)([\w-]+)(\s*:)/gm, '$1<span class="hl-attr">$2</span>$3')
  }
  if (lang === 'markdown') {
    working = working.replace(/^(#{1,6}\s.*)$/gm, '<span class="hl-keyword">$1</span>')
    working = working.replace(/\*\*([^*]+)\*\*/g, '<span class="hl-tag">**$1**</span>')
    working = working.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="hl-attr">[$1]</span>(<span class="hl-string">$2</span>)')
  }
  placeholders.forEach((html, index) => {
    working = working.split(`__KS_HL_${index}__KS__`).join(html)
  })
  return working
}

export function FileEditor({
  path,
  value,
  onChange
}: {
  path: string
  value: string
  onChange: (value: string) => void
}) {
  const markdown = isMarkdownPath(path)
  const [mode, setMode] = useState<'edit' | 'preview'>(markdown ? 'preview' : 'edit')
  const lang = languageFor(path)
  const preRef = useRef<HTMLPreElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const gutterRef = useRef<HTMLDivElement | null>(null)

  const highlighted = useMemo(() => {
    if (value.length > 200000) return escapeHtml(value)
    return highlightCode(value, lang)
  }, [value, lang])

  const lineCount = useMemo(() => value.split('\n').length, [value])

  const syncScroll = () => {
    if (!preRef.current || !inputRef.current) return
    preRef.current.scrollTop = inputRef.current.scrollTop
    preRef.current.scrollLeft = inputRef.current.scrollLeft
    if (gutterRef.current) {
      gutterRef.current.style.transform = `translateY(${-inputRef.current.scrollTop}px)`
    }
  }

  useEffect(() => {
    syncScroll()
  }, [value, mode])

  const insertTab = () => {
    const input = inputRef.current
    if (!input) return
    const start = input.selectionStart
    const end = input.selectionEnd
    onChange(`${value.slice(0, start)}  ${value.slice(end)}`)
    requestAnimationFrame(() => {
      input.selectionStart = start + 2
      input.selectionEnd = start + 2
    })
  }

  return (
    <div className="files-editor-shell">
      {(markdown || lang !== 'text') && (
        <div className="files-editor-modes">
          {markdown && (
            <>
              <button
                className={`files-editor-mode${mode === 'edit' ? ' active' : ''}`}
                onClick={() => setMode('edit')}
              >
                Edit
              </button>
              <button
                className={`files-editor-mode${mode === 'preview' ? ' active' : ''}`}
                onClick={() => setMode('preview')}
              >
                Preview
              </button>
            </>
          )}
          <span className="files-editor-lang">{lang}</span>
        </div>
      )}
      {markdown && mode === 'preview' ? (
        <div className="files-markdown-preview">
          <Markdown text={value} />
        </div>
      ) : (
        <div className="files-code-editor">
          <div className="files-code-gutter" aria-hidden="true">
            <div ref={gutterRef} className="files-code-gutter-inner">
              {Array.from({ length: lineCount }, (_, index) => (
                <span key={index}>{index + 1}</span>
              ))}
            </div>
          </div>
          <div className="files-code-body">
            <pre ref={preRef} className="files-code-highlight" aria-hidden="true">
              <code dangerouslySetInnerHTML={{ __html: `${highlighted}\n` }} />
            </pre>
            <textarea
              ref={inputRef}
              className="files-code-input"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onScroll={syncScroll}
              onKeyDown={(event) => {
                if (event.key === 'Tab') {
                  event.preventDefault()
                  insertTab()
                }
              }}
              wrap="off"
              spellCheck={false}
              aria-label={`Edit ${path}`}
            />
          </div>
        </div>
      )}
    </div>
  )
}
