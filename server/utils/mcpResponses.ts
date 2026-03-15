export function ok(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

export function json(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}
