"use client"
import { useEffect, useState } from "react"

export const PageLoader = () => {
    const [visible, setVisible] = useState(true)
    const [opacity, setOpacity] = useState(1)

    useEffect(() => {
        // small delay so the transition is visible before removal
        const fadeTimer = setTimeout(() => setOpacity(0), 80)
        const removeTimer = setTimeout(() => setVisible(false), 680)
        return () => {
            clearTimeout(fadeTimer)
            clearTimeout(removeTimer)
        }
    }, [])

    if (!visible) return null

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 99999,
                background: "var(--background)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "1.5rem",
                opacity,
                transition: "opacity 0.5s ease",
                pointerEvents: opacity === 0 ? "none" : "all",
            }}
        >
            <span style={{
                fontSize: "1.6rem",
                fontWeight: 600,
                color: "var(--bundle-color-2)",
                letterSpacing: "0.04em",
                fontFamily: "var(--font-geist-sans)",
            }}>
                Linquiq
            </span>

            {/* loading bar track */}
            <div style={{
                width: "180px",
                height: "3px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
            }}>
                <div style={{
                    height: "100%",
                    borderRadius: "999px",
                    background: "var(--bundle-color-2)",
                    animation: "pageload-slide 0.9s ease-in-out infinite",
                }} />
            </div>

            <style>{`
                @keyframes pageload-slide {
                    0%   { width: 0%;   margin-left: 0%;   }
                    50%  { width: 60%;  margin-left: 20%;  }
                    100% { width: 0%;   margin-left: 100%; }
                }
            `}</style>
        </div>
    )
}
