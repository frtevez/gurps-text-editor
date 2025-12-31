import { EditorView, minimalSetup } from "codemirror"
import { markdown } from "@codemirror/lang-markdown"
import { languages } from "@codemirror/language-data"
import { Decoration, ViewPlugin, WidgetType } from "@codemirror/view"
import "./style.css"

/* ──────────────────────────────
   Dark theme (base aesthetic)
   ────────────────────────────── */
const columnTheme = EditorView.theme({
  ".cm-content": {
    maxWidth: "80vw",
    minHeight: "auto",
    margin: "5vh 10vw 0 10vw",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  },

  ".cm-scroller": {
    display: "flex"
  },

  "div.cm-editor.cm-focused": {
    outline: "none"
  }


})

const wrappingTheme = EditorView.theme({
  ".cm-content": {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  }
})

const darkTheme = EditorView.theme(
  {
    "&": {
      height: "95vh",
      backgroundColor: "#0b0e14",
      color: "#cbd5e1",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "15px"
    },
    ".cm-activeLine": {
      backgroundColor: "transparent"
    },

    ".cm-scroller": {
      overflow: "auto",
      minHeight: "auto"
    },

    ".cm-gutters": {
      backgroundColor: "#0b0e14",
      color: "#64748b",
      border: "none"
    }
  },
  { dark: true }
)

/* ──────────────────────────────
   Expression evaluation
   ────────────────────────────── */

function evaluate(expr) {
  try {
    return Function(`"use strict"; return (${expr})`)()
  } catch {
    return "?"
  }
}

/* ──────────────────────────────
   Bracket math live preview
   ────────────────────────────── */

const bracketMathPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.build(view)
    }

    update(update) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = this.build(update.view)
      }
    }

    build(view) {
      const decos = []
      const text = view.state.doc.toString()
      const sel = view.state.selection.main

      const bracketRegex = /\[([^\]]+)\]/g
      const modifierRegex = /([+-]\d+)/g

      let lastConsumedIndex = 0
      let totalSum = 0
      let match

      while ((match = bracketRegex.exec(text))) {
        const from = match.index
        const to = from + match[0].length
        const inner = match[1]

        // Cursor inside → show raw text
        if (sel.from >= from && sel.to <= to) {
          lastConsumedIndex = to
          continue
        }

        // TOTAL handling (case-insensitive)
        if (/^total$/i.test(inner.trim())) {
          const finalTotal = totalSum

          decos.push(
            Decoration.replace({
              widget: new class extends WidgetType {
                ignoreEvent() {
                  return false
                }
                toDOM() {
                  const span = document.createElement("span")
                  span.className = "cm-bracket-result"
                  span.innerHTML = `
                    <span class="cm-bracket">[</span>
                    <span class="cm-bracket">${finalTotal}</span>
                    <span class="cm-bracket">]</span>
                  `
                  return span
                }
              }
            }).range(from, to)
          )

          lastConsumedIndex = to
          totalSum = 0
          continue
        }

        const base = evaluate(inner)
        if (typeof base !== "number") {
          lastConsumedIndex = to
          continue
        }

        const modifier = collectModifiers(text, lastConsumedIndex, from)
        const final = Math.round(base * (1 + modifier))

        totalSum += final
        lastConsumedIndex = to

        decos.push(
          Decoration.replace({
            widget: new class extends WidgetType {
              ignoreEvent() {
                return false
              }
              toDOM() {
                const span = document.createElement("span")
                span.className = "cm-bracket-result"
                span.title = modifier !== 0
                  ? `${base} × ${1 + modifier} = ${final}`
                  : `${base}`

                span.innerHTML = `
                  <span class="cm-bracket">[</span>
                  <span class="cm-result-base">${base}</span>
                  ${modifier !== 0
                    ? `<span class="cm-result-arrow">→</span>
                       <span class="cm-result-final">${final}</span>`
                    : ""
                  }
                  <span class="cm-bracket">]</span>
                `
                return span
              }
            }
          }).range(from, to)
        )
      }

      this.total = totalSum

      return Decoration.set(decos)
    }
  },
  {
    decorations: v => v.decorations
  }
)

/* ──────────────────────────────
   Result + bracket styling
   ────────────────────────────── */

const resultTheme = EditorView.theme({
  ".cm-bracket-result": {
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
    padding: "2px 6px",
    borderRadius: "6px",
    backgroundColor: "rgba(99,102,241,0.12)",
    fontWeight: "500"
  },

  ".cm-result-value": {
    color: "#c7d2fe"
  },

  ".cm-bracket": {
    color: "#ffe634"
  },

  ".cm-matchingBracket>span": {
    color: "#6734ffff"
  },

  ".cm-modifier-plus": {
    color: "#4ade80",
    fontWeight: "500"
  },

  ".cm-modifier-minus": {
    color: "#f87171",
    fontWeight: "500"
  },

  ".cm-result-base": {
    color: "#c7d2fe"
  },

  ".cm-result-final": {
    color: "#a5b4fc",
    fontWeight: "600"
  },

  ".cm-result-arrow": {
    color: "#64748b",
    margin: "0 4px"
  },
  ".cm-total-footer": {
    position: "sticky",
    bottom: "0",
    padding: "8px 12px",
    background: "rgba(11,14,20,0.9)",
    borderTop: "1px solid rgba(148,163,184,0.15)",
    color: "#e5e7eb",
    fontSize: "13px",
    textAlign: "right"
  }
})

const modifierHighlightPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.build(view)
    }

    update(update) {
      if (update.docChanged) {
        this.decorations = this.build(update.view)
      }
    }

    build(view) {
      const decos = []
      const text = view.state.doc.toString()
      const regex = /([+-]\d+)/g
      let match

      while ((match = regex.exec(text))) {
        const from = match.index
        const to = from + match[0].length

        decos.push(
          Decoration.mark({
            class: match[1].startsWith("+")
              ? "cm-modifier-plus"
              : "cm-modifier-minus"
          }).range(from, to)
        )
      }

      return Decoration.set(decos)
    }
  },
  { decorations: v => v.decorations }
)

function collectModifiers(text, start, end) {
  const slice = text.slice(start, end)
  const regex = /([+-]\d+)/g

  let total = 0
  let match

  while ((match = regex.exec(slice))) {
    total += Number(match[1]) / 100
  }

  if (total < -0.8) total = -0.8

  return total
}

/* ──────────────────────────────
   Editor instance
   ────────────────────────────── */

let view = new EditorView({
  doc: "Advantage, Modifier +10 [10*5*2]",
  extensions: [
    wrappingTheme,
    minimalSetup,
    markdown({ codeLanguages: languages }),
    darkTheme,
    resultTheme,
    modifierHighlightPlugin,
    bracketMathPlugin,
    columnTheme
  ],
  parent: document.body
})
