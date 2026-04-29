export const metadata = {
  title: "How to install Ollama",
}

export default function HowToInstallOllamaPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">
      <h1 className="text-2xl font-bold">How to install Ollama</h1>
      <ol className="space-y-3 list-decimal pl-5 text-sm">
        <li>
          <a
            href="https://ollama.com/download"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Download
          </a> and install Ollama.
        </li>
        <li>
          Download a language model (LLM).<br />
          A fitting model depends on your hardware.<br />
          There are more models than just listed on Ollama available.<br />
          Please refer to other resources (i.e. Google, Grok, Claude or ChatGPT/Codex) for recommendations.
        </li>
      </ol>
    </div>
  )
}
