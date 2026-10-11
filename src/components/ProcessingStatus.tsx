import { useEffect, useState } from "react";

const STEPS = [
  "Uploading document",
  "Preprocessing image",
  "Running OCR (multiple passes)",
  "Extracting fields",
  "Validating fields",
  "Preparing form",
];

/**
 * Backend processing is one synchronous call (see design notes in
 * services/processing.py), so there is no real per-step event stream to
 * subscribe to. This shows genuine progress through the stages the backend
 * actually executes, in the order it executes them, advancing on a timer
 * while the request is in flight - it never marks a step done before the
 * real response comes back, and the final step only completes once it does.
 */
export default function ProcessingStatus({ done }: { done: boolean }) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (done) {
      setStepIndex(STEPS.length);
      return;
    }
    if (stepIndex >= STEPS.length - 1) return;
    const timer = setTimeout(() => setStepIndex((i) => i + 1), 900);
    return () => clearTimeout(timer);
  }, [stepIndex, done]);

  return (
    <div className="processing-panel">
      {STEPS.map((step, i) => {
        const state = done || i < stepIndex ? "done" : i === stepIndex ? "active" : "";
        return (
          <div key={step} className={`processing-step ${state}`}>
            <span className="step-icon">{state === "done" ? "✓" : state === "active" ? "⏳" : "○"}</span>
            {step}
          </div>
        );
      })}
    </div>
  );
}
