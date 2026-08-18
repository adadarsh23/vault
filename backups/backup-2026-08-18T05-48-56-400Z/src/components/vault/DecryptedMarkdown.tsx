import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { decryptData } from '../../lib/cryptoPrimitives';

interface DecryptedMarkdownProps {
  content: string;
  masterKey: string | CryptoKey;
  showHtmlPreview?: boolean;
}

const getSafeMarkdownHref = (href?: string) => {
  if (!href) return '#';
  const trimmedHref = href.trim();
  if (!trimmedHref) return '#';

  if (
    trimmedHref.startsWith('#') ||
    trimmedHref.startsWith('/') ||
    trimmedHref.startsWith('./') ||
    trimmedHref.startsWith('../')
  ) {
    return trimmedHref;
  }

  const lowerHref = trimmedHref.toLowerCase();
  if (
    lowerHref.startsWith('javascript:') ||
    lowerHref.startsWith('data:') ||
    lowerHref.startsWith('vbscript:')
  ) {
    return '#';
  }

  try {
    const parsed = new URL(trimmedHref, window.location.origin);
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
      return trimmedHref;
    }
  } catch {
    return '#';
  }

  return '#';
};

const buildHtmlDocument = (body: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
  </head>
  <body>${body}</body>
</html>`;

const buildSanitizedHtmlDocument = (markdownContent: string): string => {
  try {
    const markdownAsHtml = marked.parse(markdownContent, {
      gfm: true,
      breaks: true,
      async: false,
    });
    const safeBodyHtml = DOMPurify.sanitize(markdownAsHtml, {
      USE_PROFILES: { html: true },
    });
    return buildHtmlDocument(safeBodyHtml);
  } catch {
    return buildHtmlDocument('<p>HTML preview failed to render.</p>');
  }
};

export const DecryptedMarkdown: React.FC<DecryptedMarkdownProps> = ({
  content,
  masterKey,
  showHtmlPreview = false,
}) => {
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setError(false);
    setDecrypted(null);

    const decrypt = async () => {
      try {
        const result = await decryptData(content, masterKey);
        if (isMounted) setDecrypted(result);
      } catch {
        if (isMounted) setError(true);
      }
    };
    decrypt();
    return () => {
      isMounted = false;
    };
  }, [content, masterKey]);

  const htmlDocument = useMemo(
    () => (decrypted ? buildSanitizedHtmlDocument(decrypted) : ''),
    [decrypted]
  );
  const sanitizedMarkdown = useMemo(
    () =>
      decrypted
        ? DOMPurify.sanitize(decrypted, {
            USE_PROFILES: { html: true },
          })
        : '',
    [decrypted]
  );

  if (error)
    return (
      <div className="text-red-400 p-4 border border-red-500/20 rounded-xl bg-red-400/5">
        Decryption failed. Please check your master key.
      </div>
    );
  if (decrypted === null)
    return (
      <div className="animate-pulse flex items-center gap-2 text-text/30 p-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Decrypting...
      </div>
    );

  if (showHtmlPreview) {
    return (
      <iframe
        title="HTML Preview"
        srcDoc={htmlDocument}
        sandbox=""
        className="w-full h-[600px] border-none bg-white rounded-xl"
      />
    );
  }

  return (
    <div className="prose prose-invert max-w-none prose-h1:text-3xl prose-h2:text-2xl prose-p:text-text/80 prose-li:text-text/70 prose-strong:text-emerald-400 prose-code:text-emerald-300">
      <ReactMarkdown
        rehypePlugins={[rehypeRaw]}
        components={{
          p: ({ children }) => <p className="whitespace-pre-wrap break-words">{children}</p>,
          li: ({ children }) => <li className="whitespace-pre-wrap break-words">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="whitespace-pre-wrap break-words">{children}</blockquote>
          ),
          a: ({ href, ...props }) => (
            <a
              {...props}
              href={getSafeMarkdownHref(href)}
              className="text-blue-400 hover:text-blue-300 underline underline-offset-4 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
              }}
            />
          ),
        }}
      >
        {sanitizedMarkdown}
      </ReactMarkdown>
    </div>
  );
};
