"use client";
import React, {useEffect, useRef, useState} from "react";
import {useChat} from "@ai-sdk/react";
import {Resizable} from 're-resizable'
import {MessageSquareIcon, XIcon, SendIcon} from 'lucide-react'
import {motion, AnimatePresence, useDragControls} from 'framer-motion'
import {DefaultChatTransport} from "ai";

type ToolPart =
    | {
    type: string; // Starts with 'tool-' or 'text-'
    state?: string; // For tools to report their state
    input?: any; // For tools
    output?: any; // For tools
    toolName?: string;
    toolCallId?: string;
}
    | any;

export default function Chat() {
    // record of processed tool calls using their IDs
    const processedIds = useRef<Set<string>>(new Set());
    // use of Vercel's AI SDK
    const {messages, sendMessage, status, stop} = useChat({
        transport: new DefaultChatTransport({
            api: '/api/chat',
        }),
        messages: [
            {
                id: 'welcome',
                role: 'assistant',
                parts: [{ type: 'text', text: 'Hi, I am MapChat! I can find places for you, or even recommend some places to you, then display them on the map behind me! Let me know how I can help you today :)' }],
            },
        ],
    });
    // represents if chatbot is in thought or trying to send their message to UI
    const isLoading = status === "streaming" || status === "submitted";
    // for form purposes
    const [input, setInput] = useState("");

    // states and refs used for pop-up button, as well as moving and resizing capabilities of said button and the pop-up
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState({
        x: 20,
        y: 20,
    });
    const [buttonPosition, setButtonPosition] = useState({
        x: 20,
        y: 20,
    });
    const dragControls = useDragControls();
    const [hasButtonMoved, setHasButtonMoved] = useState(false);
    const messagesEndRef = useRef(null);
    const chatbotRef = useRef(null);
    const containerRef = useRef(null);
    const buttonRef = useRef(null);

    // When tool results arrive, dispatch them to the Map via a custom DOM event
    useEffect(() => {
        for (const m of messages) {
            if (m.role !== "assistant" || !Array.isArray(m.parts)) continue;
            for (const part of m.parts as ToolPart[]) {
                const type = part?.type || "";
                const looksLikeTool = type.startsWith("tool-") || type === "tool-invocation" || type === "dynamic-tool";
                if (!looksLikeTool) continue;

                const state = part.state || part.toolInvocation?.state;
                const output = part.output ?? part.toolInvocation?.result;
                const callId = part.toolCallId ?? part.toolInvocation?.toolCallId ?? `${m.id}-${type}`;
                // this will detect if a tool has completed its execution
                if (state && state.includes("output") && output && !processedIds.current.has(callId)) {
                    processedIds.current.add(callId);
                    try {
                        // Expect { ok: true, data: <FeatureCollection> } from our tool
                        if (output.ok && output.data && output.data.type === "FeatureCollection") {
                            if (output.source === "nominatim") window.dispatchEvent(new CustomEvent("nominatim-tool-complete", {detail: output.data}));
                            else window.dispatchEvent(new CustomEvent("fsq-tool-complete", {detail: output.data}));
                        }
                    } catch {
                    }
                }
            }
        }
    }, [messages]);

    // the following are styling useEffects and event handlers
    const clampToBounds = () => {
        const el = chatbotRef.current as HTMLElement | null;
        const container = containerRef.current as HTMLElement | null;
        if (!el || !container) return;

        const rect = el.getBoundingClientRect();
        const crect = container.getBoundingClientRect();

        const maxX = crect.width - rect.width;
        const maxY = crect.height - rect.height;

        // Use current visual left/top (rect.*), not previous state,
        // then clamp and write back to x/y state.
        const clampedX = Math.max(0, Math.min(rect.left - crect.left, maxX));
        const clampedY = Math.max(0, Math.min(rect.top - crect.top, maxY));

        setPosition({ x: clampedX, y: clampedY });
    };
    const toggleChatWindow = () => {
        if (!isOpen && !hasButtonMoved) {
            setIsOpen(true);
        }
        else {
            setHasButtonMoved(false);
        }

        if (isOpen) {
            setIsOpen(false);
        }
    }
    useEffect(() => {
        // reclamp when visual viewport changes (Chrome URL bar show/hide)
        const vv = (window as any).visualViewport;
        if (!vv) return;
        const onResize = () => clampToBounds();
        vv.addEventListener("resize", onResize);
        vv.addEventListener("scroll", onResize);
        return () => {
            vv.removeEventListener("resize", onResize);
            vv.removeEventListener("scroll", onResize);
        };
    }, []);
    useEffect(() => {
        if (messagesEndRef.current) {
            (messagesEndRef.current as any).scrollIntoView({
                behavior: 'smooth',
            });
        }
    }, [messages]);

    return (
        <>
            <div
                ref={containerRef}
                style={{
                    position: "fixed",
                    inset: 0,
                    // Use dynamic viewport units so Chrome’s URL bar is excluded
                    // Fallback order for cross-browser:
                    height: "100dvh",
                    width: "100vw",
                    pointerEvents: "none", // don't block clicks; the child re-enables
                    // If you need safe areas (iOS):
                    paddingTop: "env(safe-area-inset-top)",
                    paddingBottom: "env(safe-area-inset-bottom)",
                }}
            />
            <AnimatePresence>
                {!isOpen && (
                    <motion.div
                        ref={buttonRef}
                        style={{ position: 'fixed', left: 0, top: 0, x: buttonPosition.x, y: buttonPosition.y }}
                        className="z-50"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        drag
                        dragConstraints={containerRef}
                        dragElastic={0}
                        dragMomentum={false}
                        onDragStart={() => setHasButtonMoved(true)}
                        onDragEnd={() => {
                            const rect = (buttonRef.current as any).getBoundingClientRect();
                            setButtonPosition({ x: rect.left, y: rect.top });
                            clampToBounds();
                            setHasButtonMoved(false);
                        }}
                        onMouseUp={() => toggleChatWindow()}
                    >
                        <button
                            className={
                                hasButtonMoved ?
                                "pop-up-button cursor-move drop-shadow-xl" :
                                "pop-up-button cursor-pointer drop-shadow-none"
                            }
                        >
                            <MessageSquareIcon size={24} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        ref={chatbotRef}
                        style={{
                            position: 'fixed',
                            left: `0`,
                            top: `0`,
                            x: position.x,
                            y: position.y,
                        }}
                        className="z-50"
                        initial={{
                            scale: 0.9,
                            opacity: 0,
                            y: 20,
                        }}
                        animate={{
                            scale: 1,
                            opacity: 1,
                            y: 0,
                        }}
                        exit={{
                            scale: 0.9,
                            opacity: 0,
                            y: 20,
                        }}
                        transition={{
                            type: 'spring',
                            stiffness: 400,
                            damping: 30,
                        }}
                        drag
                        dragControls={dragControls}
                        dragListener={false}       // we’ll start drag from the titlebar only
                        dragConstraints={containerRef}
                        dragElastic={0}
                        dragMomentum={false}
                        onDragEnd={(_, info) => {
                            // Persist the transform offset into state
                            setPosition(p => ({ x: p.x + info.offset.x, y: p.y + info.offset.y }));
                            // Then clamp to visible viewport
                            clampToBounds();
                        }}
                    >
                        <Resizable
                            defaultSize={{
                                width: 350,
                                height: 500,
                            }}
                            minWidth={300}
                            minHeight={300}
                            maxWidth={600}
                            maxHeight={700}
                            bounds="window"
                            enable={{
                                top: true,
                                right: true,
                                bottom: true,
                                left: true,
                                topRight: true,
                                bottomRight: true,
                                bottomLeft: true,
                                topLeft: true,
                            }}
                            onResizeStart={(e, direction) => {
                                // Store the initial position for calculations during resize
                                if (chatbotRef.current) {
                                    (chatbotRef.current as any).dataset.initialX = position.x;
                                    (chatbotRef.current as any).dataset.initialY = position.y;
                                }
                            }}
                            onResize={(e, direction, ref, d) => {
                                const initialX = Number((chatbotRef.current as any).dataset.initialX ?? position.x);
                                const initialY = Number((chatbotRef.current as any).dataset.initialY ?? position.y);

                                // Maintain left/top handles behavior
                                if (direction.toLowerCase().includes('left')) {
                                    setPosition((prev) => ({ ...prev, x: initialX - d.width }));
                                }
                                if (direction.toLowerCase().includes('top')) {
                                    setPosition((prev) => ({ ...prev, y: initialY - d.height }));
                                }

                                // Clamp right/bottom to the *visible* viewport
                                const vv = (window as any).visualViewport;
                                const vw = vv?.width ?? window.innerWidth;
                                const vh = vv?.height ?? window.innerHeight;

                                // Where is the panel right now (top-left)?
                                // Since we switched to transform-based drag, use the state `position`
                                // (which we sync on dragEnd and on open)
                                const maxWidth = Math.max(0, vw - position.x);
                                const maxHeight = Math.max(0, vh - position.y);

                                const curW = ref.offsetWidth;
                                const curH = ref.offsetHeight;

                                if (curW > maxWidth) {
                                    ref.style.width = `${maxWidth}px`;
                                }
                                if (curH > maxHeight) {
                                    ref.style.height = `${maxHeight}px`;
                                }
                            }}
                            onResizeStop={() => clampToBounds()}
                            className="pop-up-chat"
                        >
                            <div
                                className="pop-up-drag-bar drag-handle"
                                onPointerDown={(e) => dragControls.start(e)}
                            >
                                <div className="flex items-center">
                                    <MessageSquareIcon size={20} className="mr-2" />
                                    <span className="font-medium noselect">MapChat</span>
                                </div>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => toggleChatWindow()}
                                        className="hover:bg-blue-700 p-1 rounded"
                                    >
                                        <XIcon size={16} />
                                    </button>
                                </div>
                            </div>
                            <div className="messages custom-scrollbar" id="messages">
                                {messages.map((m) => (
                                    <div key={m.id} className={`msg ${(m.role as string) === "user" ? "user" : "assistant"}`}>
                                        <div className="badge">{(m.role as string) === "user" ? "You" : "MapChat"}</div>
                                        {"parts" in m && Array.isArray(m.parts) ? (
                                            m.parts.map((p: any, i: number) => {
                                                if (p.type === "text") return <div key={i}>{p.text}</div>;
                                                if ((p.type?.startsWith?.("tool-") || p.type === "dynamic-tool")) {
                                                    return (
                                                        <div key={i}>
                                                            {p.state?.includes("input-available") && p.toolName && p.toolName.includes("nominatimSearch") && (
                                                                <div className="text-xs font-light">Finding the location...</div>
                                                            )}
                                                            {p.state?.includes("input-available") && p.toolName && p.toolName.includes("foursquareSearch") && (
                                                                <div className="text-xs font-light">Finding the recommendations...</div>
                                                            )}
                                                            {p.state?.includes("error") && p.output?.ok === false && (
                                                                <div className="text-xs font-light text-red-500">Tool error: {p.output.error}</div>
                                                            )}
                                                            {p.state?.includes("output-available") && p.output?.ok && p.output?.data?.type === "FeatureCollection" && (
                                                                <div className="text-xs font-light">Found and added {p.output.data.features.length} locations to map!</div>
                                                            )}
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            })
                                        ) : (
                                            <div>{(m as any).content || ""}</div>
                                        )}
                                        {m.role === "assistant" && status === "submitted" && (
                                            <div className="text-xs font-light">Thinking...</div>
                                        )}
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            <form className="form" onSubmit={e => {
                                e.preventDefault();
                                if (input.trim()) {
                                    sendMessage({text: input});
                                    setInput('');
                                }
                            }}>
                                <input
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Ask about a place or for recommendations..."
                                    aria-label="Message"
                                />
                                <button type="submit" disabled={isLoading}>
                                    <SendIcon size={18} />
                                </button>
                                {isLoading && <button type="button" onClick={() => stop()}>Stop</button>}
                            </form>
                        </Resizable>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}