import React from "react";

export type PreferenceSaveFeedbackValue = {
  status: "applied" | "partial" | "rejected" | "unconfirmed";
  error?: string;
};

export function PreferenceSaveFeedback({
  feedback,
  subject,
  plural = false,
}: {
  feedback: PreferenceSaveFeedbackValue | null;
  subject: string;
  plural?: boolean;
}) {
  if (!feedback) return null;
  const agreement = plural ? "were" : "was";
  if (feedback.status === "applied") {
    return (
      <p role="status">
        {subject} saved.
        {feedback.error && ` Other views may need refresh: ${feedback.error}`}
      </p>
    );
  }
  if (feedback.status === "rejected") {
    return (
      <p role="alert">
        {subject} {agreement} not saved: {feedback.error}
      </p>
    );
  }
  if (feedback.status === "partial") {
    return (
      <p role="alert">
        {subject} {agreement} only partly saved: {feedback.error}
      </p>
    );
  }
  return (
    <p role="alert">
      {subject} save could not be confirmed. Current{" "}
      {plural ? "settings were" : "setting was"} refreshed. {feedback.error}
    </p>
  );
}
