import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Shield, Scale, Copy } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
// import { Background } from '../components/layout/Background'

const LICENSE_TEXT = `Copyright (c) 2026 Vault

All rights reserved.

This software and associated source code are proprietary and confidential. No permission is granted to use, copy, modify, merge, publish, distribute, sublicense, or sell this software, in whole or in part, without prior written permission from the copyright holder.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM,OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

interface LegalPageProps {}

export function LegalPage({}: LegalPageProps) {
  const shouldReduceMotion = useReducedMotion();
  const { hash } = useLocation();
  const [licenseHeading, ...licenseRest] = LICENSE_TEXT.split('\n');
  const licenseBody = licenseRest.join('\n');

  useEffect(() => {
    if (hash) {
      // Small delay to ensure the content is rendered and animations are started
      const timeoutId = setTimeout(() => {
        const element = document.getElementById(hash.substring(1));
        if (element) {
          element.scrollIntoView({
            behavior: shouldReduceMotion ? 'auto' : 'smooth',
            block: 'start',
          });
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [hash, shouldReduceMotion]);

  const sections = [
    {
      id: 'privacy',
      title: 'Privacy Policy',
      icon: Shield,
      content: (
        <div className="space-y-6">
          <p>
            Your privacy is our highest priority at Vault. Our architecture is built on the
            principle of Zero-Knowledge - meaning we never have access to your encryption keys or
            your raw data.
          </p>

          <h3 className="text-xl font-bold text-text">Data Collection</h3>
          <p>
            We collect minimal technical information required to maintain your secure session. This
            includes encrypted authentication tokens and anonymized system telemetry to ensure
            reliability. We do not track your activity, and we never sell your data.
          </p>

          <h3 className="text-xl font-bold text-text">Local Encryption</h3>
          <p>
            All files, notes, and sensitive data are encrypted locally on your device before being
            uploaded. The encryption keys never leave your browser or app environment unless you
            explicitly export them.
          </p>

          <h3 className="text-xl font-bold text-text">Your Rights</h3>
          <p>
            You have the right to export your data, delete your account entirely, and audit the
            security of our application. As a privacy-first platform, we empower you with full
            control over your digital footprint.
          </p>
        </div>
      ),
    },
    {
      id: 'license',
      title: 'License Agreement',
      icon: Scale,
      content: (
        <div className="space-y-6">
          <div className="overflow-x-auto font-mono text-sm leading-relaxed text-text/70">
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="whitespace-pre-wrap">{licenseHeading}</p>
              <button
                type="button"
                aria-label="Copy license text"
                title="Copy license text"
                className="rounded-md p-1.5 text-text/60 transition-colors hover:bg-text/10 hover:text-text"
                onClick={async () => {
                  try {
                    if (!navigator.clipboard) {
                      toast.error('Clipboard is not available on this browser');
                      return;
                    }
                    await navigator.clipboard.writeText(LICENSE_TEXT);
                    toast.success('License Agreement copied');
                  } catch {
                    toast.error('Unable to copy License Agreement');
                  }
                }}
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <div className="whitespace-pre-wrap">{licenseBody}</div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen text-text selection:bg-text selection:text-bg">
      {/* <Background /> */}

      {/* Header */}
      {/* <nav className="relative z-10 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-6 mx-auto max-w-5xl">
        <button
          onClick={() => onNavigate?.('settings')}
          className="flex items-center gap-2.5 group"
        >
          <div className="p-2 rounded-xl bg-text/5 text-text border border-text/10 group-hover:bg-text group-hover:text-bg transition-all duration-300">
            <ArrowLeft className="w-5 h-5" />
          </div>
          <span className="font-semibold text-text/60 group-hover:text-text transition-colors text-sm">Back</span>
        </button>
      </nav> */}

      {/* Content */}
      <main className="relative z-10 mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <header className="mb-12 rounded-[2rem] border border-card-border bg-card-bg p-6 shadow-sm dark:border-white/10 dark:bg-black/90 md:p-8">
            <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
              Legal & <span className="font-medium italic text-text/40">Compliance</span>
            </h1>
            <p className="text-lg font-medium text-text/50">Last updated: March 2026</p>
          </header>

          <div className="space-y-24">
            {sections.map((section, idx) => (
              <motion.section
                key={section.id}
                id={section.id}
                initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.8, delay: idx * 0.1 }}
                className="relative"
              >
                <div className="mb-8 flex items-center gap-4">
                  <div className="rounded-[1.1rem] border border-card-border bg-card-bg p-3 text-text dark:border-white/10 dark:bg-black/40">
                    <section.icon className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-bold">{section.title}</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  <div className="rounded-[1.5rem] border border-card-border bg-card-bg p-6 text-lg font-medium leading-relaxed text-text/70 dark:border-white/10 dark:bg-black/80 lg:col-span-8">
                    {section.content}
                  </div>
                  <div className="lg:col-span-4 hidden lg:block">
                    <div className="sticky top-24 rounded-[1.5rem] border border-card-border bg-card-bg p-6 dark:border-white/10 dark:bg-black/80">
                      <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-text/35">
                        Quick Links
                      </h4>
                      <nav className="flex flex-col gap-3">
                        {sections.map((s) => (
                          <a
                            key={s.id}
                            href={`#${s.id}`}
                            className={`text-sm font-semibold uppercase tracking-[0.12em] transition-colors ${s.id === section.id ? 'text-text' : 'text-text/40 hover:text-text/70'}`}
                          >
                            {s.title}
                          </a>
                        ))}
                      </nav>
                    </div>
                  </div>
                </div>
              </motion.section>
            ))}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
