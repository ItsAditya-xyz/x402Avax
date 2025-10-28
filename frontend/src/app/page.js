"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Send, RotateCcw, Square, Trash2, Sparkles } from "lucide-react";
import gladiusImage from "../../public/icons/GLADIUS.png";
import gladiusFace from "../../public/icons/FACE.png";
import FormBuilder from "../../components/formBuilder";

import { memo } from "react";


export default function Page() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hello! I'm here to help. What can I assist you with today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  function renderWithLinks(str) {
    const parts = [];
    const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parts.push(str.slice(lastIndex, match.index));
      }
      parts.push(
        <a
          key={`${match[2]}-${match.index}`}
          href={match[2]}
          target='_blank'
          rel='noopener noreferrer'
          className='text-emerald-700 hover:text-emerald-800 underline underline-offset-2'>
          {match[1]}
        </a>
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < str.length) parts.push(str.slice(lastIndex));
    return <>{parts}</>;
  }

  // wei -> token string (trim trailing zeros, 6 decimal max)
  function formatWeiToToken(weiStr, decimals = 18) {
    try {
      const wei = BigInt(weiStr);
      const base = 10n ** BigInt(decimals);
      const whole = wei / base;
      const frac = wei % base;
      let fracStr = frac.toString().padStart(decimals, "0");
      // keep up to 6 decimals for display
      fracStr = fracStr.slice(0, 6).replace(/0+$/, "");
      return fracStr ? `${whole}.${fracStr}` : whole.toString();
    } catch {
      return "—";
    }
  }

  // resolve token name from address (fallback to address tail)
  function resolveTokenName(addr) {
    const a = addr.toLowerCase();
    if (a === "0x0000000000000000000000000000000000000000") return "AVAX";
    if (a === "0xb8d7710f7d8349a506b75dd184f05777c82dad0c") return "ARENA";
    if (a === "0x34a1d2105dd1b658a48ead516a9ce3032082799c") return "GLADIUS";
    return `Token (${addr.slice(0, 6)}…${addr.slice(-4)})`;
  }
  const listRef = useRef(null);
  const abortRef = useRef(null);
  const lastUserRef = useRef(null);
  const FORM_SENTINEL = "[[FORM_BUILDER]]";
  const FORM_BUBBLE_TOKEN = "__FORM_BUILDER__";
  const formInjectedRef = useRef(false);
  useEffect(() => {
    if (!autoScroll) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, autoScroll]);

  const sendMessage = async (userText) => {
    if (!userText?.trim() || loading) return;

    setErrorMsg("");
    setLoading(true);

    const next = [...messages, { role: "user", content: userText }];
    setMessages(next);
    lastUserRef.current = userText;

    const assistantIndex = next.length;
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Request failed with ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;

      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });

          // If sentinel appears and we haven't injected the form yet:
          if (!formInjectedRef.current && chunk.includes(FORM_SENTINEL)) {
            formInjectedRef.current = true;

            // Replace the assistant placeholder with a short lead-in + the special form bubble
            setMessages((prev) => {
              const clone = [...prev];
              // replace the current assistant placeholder with a short message
              clone[assistantIndex] = {
                role: "assistant",
                content:
                  "Let’s set up your x402 gated API real quick. Submit this form!",
              };
              // then push the special bubble right after
              clone.push({ role: "assistant", content: FORM_BUBBLE_TOKEN });
              return clone;
            });

            // IMPORTANT: skip appending the raw sentinel text to the message
            continue;
          }

          // If we've already injected the form for this assistant turn, ignore further model text
          if (formInjectedRef.current) continue;

          // Normal streaming append
          setMessages((prev) => {
            const clone = [...prev];
            clone[assistantIndex] = {
              role: "assistant",
              content: (clone[assistantIndex]?.content || "") + chunk,
            };
            return clone;
          });
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        // User pressed Stop
      } else {
        setErrorMsg(err?.message || "Something went wrong.");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
      formInjectedRef.current = false; // reset for next turn
    }
  };

  const onSubmit = () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    sendMessage(text);
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const regenerate = () => {
    if (loading) return;
    const lastUser = lastUserRef.current;
    if (!lastUser) return;
    setMessages((prev) => {
      if (prev[prev.length - 1]?.role === "assistant") {
        return prev.slice(0, -1);
      }
      return prev;
    });
    sendMessage(lastUser);
  };

  const formatContent = (text) => {
    if (!text) return null;

    const lines = text.split("\n");
    const elements = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Headings
      if (line.startsWith("# ")) {
        elements.push(
          <h1 key={i} className='text-2xl font-bold mt-6 mb-3 text-slate-900'>
            {line.slice(2)}
          </h1>
        );
      } else if (line.startsWith("## ")) {
        elements.push(
          <h2 key={i} className='text-xl font-bold mt-5 mb-2.5 text-slate-900'>
            {line.slice(3)}
          </h2>
        );
      } else if (line.startsWith("### ")) {
        elements.push(
          <h3
            key={i}
            className='text-lg font-semibold mt-4 mb-2 text-slate-900'>
            {line.slice(4)}
          </h3>
        );
      }
      // Bullet lists
      else if (line.match(/^[\-\*]\s/)) {
        const listItems = [];
        while (i < lines.length && lines[i].match(/^[\-\*]\s/)) {
          listItems.push(
            <li key={i} className='ml-5'>
              {lines[i].slice(2)}
            </li>
          );
          i++;
        }
        elements.push(
          <ul key={`ul-${i}`} className='list-disc space-y-1.5 my-3'>
            {listItems}
          </ul>
        );
        continue;
      }
      // Numbered lists
      else if (line.match(/^\d+\.\s/)) {
        const listItems = [];
        while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
          listItems.push(
            <li key={i} className='ml-5'>
              {lines[i].replace(/^\d+\.\s/, "")}
            </li>
          );
          i++;
        }
        elements.push(
          <ol key={`ol-${i}`} className='list-decimal space-y-1.5 my-3'>
            {listItems}
          </ol>
        );
        continue;
      }
      // Code blocks
      else if (line.startsWith("```")) {
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].startsWith("```")) {
          codeLines.push(lines[i]);
          i++;
        }
        elements.push(
          <pre
            key={i}
            className='bg-slate-900 text-slate-100 rounded-lg p-4 my-3 overflow-x-auto'>
            <code className='text-sm font-mono'>{codeLines.join("\n")}</code>
          </pre>
        );
      }
      // Inline code
      else if (line.includes("`")) {
        const parts = line.split(/(`[^`]+`)/g);
        elements.push(
          <p key={i} className='my-2'>
            {renderWithLinks(line)}
          </p>
        );
      }
      // Bold text
      else if (line.includes("**")) {
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        elements.push(
          <p key={i} className='my-2'>
            {parts.map((part, idx) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={idx} className='font-semibold text-slate-900'>
                  {renderWithLinks(part.slice(2, -2))}
                </strong>
              ) : (
                <span key={idx}>{renderWithLinks(part)}</span>
              )
            )}
          </p>
        );
      }
      // Empty line
      else if (line.trim() === "") {
        elements.push(<div key={i} className='h-2' />);
      }
      // Regular paragraph
      else {
        elements.push(
          <p key={i} className='my-2'>
            {renderWithLinks(line)}
          </p>
        );
      }

      i++;
    }

    return <div className='space-y-0.5'>{elements}</div>;
  };

  const Bubble = ({ role, content }) => {
    const isAssistant = role === "assistant";

    // Render the inline form bubble
    if (isAssistant && content === "__FORM_BUILDER__") {
      return (
        <div className='flex justify-start mb-6'>
          <div className='flex gap-3 max-w-3xl'>
            <div className='flex-shrink-0 w-10 h-10 rounded-full'>
              <img src={gladiusImage.src} className='w-10 h-10 rounded-full' />
            </div>
            <div className='flex-1'>
              <FormBuilder
                onSuccess={({ apiId, summary }) => {
                  const origin =
                    typeof window !== "undefined" ? window.location.origin : "";
                  const x402Url = `${origin}/api/${apiId}`;
                  const x402Humans = `${origin}/${apiId}`;
                  const tokenName = resolveTokenName(summary.token_address);
                  const prettyAmount = formatWeiToToken(summary.amount_wei);

                  const clean = [
                    "# ✅ API saved",
                    `**x402 URI (For Agents):** [${x402Url}](${x402Url})`,
                    `**x402 URL (For Users):** [${x402Humans}](${x402Humans})`,
                    `**Token:** ${tokenName}`,
                    `**Amount:** ${prettyAmount}`,
                    `**Session:** ${summary.valid_for_sec}s`,
                    `**Original URL:** [${summary.api_url}](${summary.api_url})`,
                  ].join("\n");

                  setMessages((prev) => {
                    const clone = [...prev];
                    // replace the last message (the form bubble we just rendered)
                    const last = clone.length - 1;
                    clone[last] = { role: "assistant", content: clean };
                    return clone;
                  });
                }}
              />
            </div>
          </div>
        </div>
      );
    }

    // …your existing bubble rendering below
    const isAssistantStyle = isAssistant
      ? "bg-white text-slate-800 border border-slate-200"
      : "bg-slate-800 text-white";

    return (
      <div
        className={`flex ${
          isAssistant ? "justify-start" : "justify-end"
        } mb-6`}>
        <div
          className={`flex gap-3 max-w-3xl ${
            isAssistant ? "flex-row" : "flex-row-reverse"
          }`}>
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              isAssistant ? "" : "bg-slate-800"
            }`}>
            {isAssistant ? (
              <img src={gladiusImage.src} className='w-10 h-10 rounded-full' />
            ) : (
              <span className='text-sm font-semibold text-white'>You</span>
            )}
          </div>
          <div
            className={`flex-1 px-5 py-3.5 rounded-2xl text-[15px] leading-relaxed ${isAssistantStyle}`}>
            {content ? (
              isAssistant ? (
                formatContent(content)
              ) : (
                <div className='whitespace-pre-wrap'>{content}</div>
              )
            ) : isAssistant ? (
              <span className='text-slate-400'>
                Looking into the arena with my sword ⚔
              </span>
            ) : (
              ""
            )}
          </div>
        </div>
      </div>
    );
  };

  const MemoBubble = memo(Bubble);

  const canRegenerate = useMemo(() => {
    if (!messages.length) return false;
    const last = messages[messages.length - 1];
    return last.role === "assistant" && !!lastUserRef.current && !loading;
  }, [messages, loading]);

  return (
    <div className='h-screen flex flex-col bg-gradient-to-br from-slate-50 via-slate-50 to-slate-100'>
      {/* Header */}
      <header className='flex-shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur-xl'>
        <div className='max-w-5xl mx-auto px-6 h-16 flex items-center justify-between'>
          <div className='flex items-center gap-3'>
            <div className='w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg shadow-emerald-600/20'>
              <img
                src={gladiusImage.src}
                alt='Logo'
                className='w-10 h-10 rounded-xl'
              />
            </div>
            <div>
              <h1 className='text-lg font-semibold text-slate-900'>Gladius</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Messages Container */}
      <div className='flex-1 overflow-hidden'>
        <div ref={listRef} className='h-full overflow-y-auto'>
          <div className='max-w-5xl mx-auto px-6 py-8'>
          {messages.map((m, i) => (
  <MemoBubble key={i} role={m.role} content={m.content} />
))}
            {errorMsg && (
              <div className='flex justify-center mb-6'>
                <div className='max-w-3xl w-full bg-red-50 border border-red-200 rounded-xl px-5 py-3.5 text-sm text-red-800'>
                  <span className='font-semibold'>Error:</span> {errorMsg}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Input Area - Fixed at Bottom */}
      <div className='flex-shrink-0 border-t border-slate-200 bg-white/80 backdrop-blur-xl'>
        <div className='max-w-5xl mx-auto px-6 py-4'>
          <div className='bg-white rounded-2xl border border-slate-300 shadow-lg focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-100 transition-all'>
            <textarea
              className='w-full resize-none outline-none px-5 pt-4 pb-2 text-[15px] text-slate-900 placeholder:text-slate-400 bg-transparent'
              rows={2}
              placeholder='Ask me anything...'
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              disabled={loading}
            />
            <div className='flex items-center justify-between px-4 pb-3 pt-1'>
              <div className='flex items-center gap-2'>
                {loading ? (
                  <button
                    type='button'
                    onClick={stop}
                    className='flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors'>
                    <Square className='w-3.5 h-3.5 fill-current' />
                    Stop
                  </button>
                ) : (
                  <>
                    <button
                      type='button'
                      onClick={onSubmit}
                      className='flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-emerald-600/20'
                      disabled={!input.trim()}>
                      <Send className='w-3.5 h-3.5' />
                      Send
                    </button>
                    <button
                      type='button'
                      onClick={regenerate}
                      className='flex items-center gap-2 px-4 py-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
                      disabled={!canRegenerate}>
                      <RotateCcw className='w-3.5 h-3.5' />
                      Regenerate
                    </button>
                  </>
                )}
              </div>
              <div className='text-xs text-slate-500'>
                <kbd className='px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-xs font-mono'>
                  Enter
                </kbd>{" "}
                to send
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
