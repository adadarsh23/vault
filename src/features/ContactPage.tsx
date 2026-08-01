import { useState, useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Send, Mail, User, MessageSquare, Tag, Loader2, CheckCircle2, ShieldCheck, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
// import { Background } from '../components/layout/Background'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { RecaptchaField } from '../components/security/RecaptchaField'
import { toast } from 'sonner'
import { useVaultStore } from '../store/vaultStore'
import { useRecaptchaChallenge } from '../hooks/useRecaptchaChallenge'

interface ContactPageProps {
  onNavigate?: (tab: string) => void
}

export function ContactPage({ }: ContactPageProps) {
  const shouldReduceMotion = useReducedMotion()
  const loggedInUsername = useVaultStore((state) => state.username)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionResult, setSubmissionResult] = useState<{ referenceId: string } | null>(null)
  const {
    token: captchaToken,
    isCompleted: isCaptchaCompleted,
    resetNonce: captchaResetNonce,
    feedback: captchaFeedback,
    handleTokenChange: handleCaptchaTokenChange,
    handleExpired: handleCaptchaExpired,
    handleError: handleCaptchaError,
    resetChallenge: resetCaptchaChallenge,
    setRejected: setCaptchaRejected,
  } = useRecaptchaChallenge()

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    username: '',
    subject: 'General Inquiry',
    message: '',
    address: '', // Honeypot field for bot protection
  })

  // SEO, Scroll management and Page Metadata
  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = 'Contact | The Vault - Secure Communications'
    const metaDesc = document.querySelector('meta[name="description"]')
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Get in touch with the Vault support team for security inquiries, technical support, or feature requests.')
    }

    if (loggedInUsername) {
      setFormData((prev) => ({ ...prev, username: loggedInUsername }))
    }
  }, [loggedInUsername])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Bot protection: if honeypot is filled, silently ignore
    if (formData.address) {
      console.warn('Bot detected via honeypot')
      setSubmissionResult({ referenceId: 'BYPASS-AUTH-882' })
      return
    }

    // Client-side validation
    if (formData.message.trim().length < 10) {
      toast.error('Message must be at least 10 characters long')
      return
    }

    if (!isCaptchaCompleted || !captchaToken) {
      toast.error('Please complete CAPTCHA before submitting.')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/contact/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim().toLowerCase(),
          username: formData.username.trim(),
          subject: formData.subject,
          message: formData.message.trim(),
          captchaToken,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setSubmissionResult({ referenceId: data.referenceId })
        toast.success(data.message || 'Message received!')

        // Reset local state (except username if logged in)
        setFormData({
          name: '',
          email: '',
          username: loggedInUsername || '',
          subject: 'General Inquiry',
          message: '',
          address: '',
        })
        resetCaptchaChallenge()
      } else {
        const errorMsg = data.error?.message || 'Failed to send message'
        setCaptchaRejected(errorMsg)
        if (data.error?.code === 'TOO_MANY_SUBMISSIONS') {
          toast.warning(errorMsg)
        } else {
          toast.error(errorMsg)
        }
      }
    } catch (error) {
      setCaptchaRejected('Network error. Please complete CAPTCHA again.')
      toast.error('Network error. Please check your connection.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  return (
    <div className="min-h-screen text-text selection:bg-text selection:text-bg">
      {/* <Background /> */}

      <main className="relative z-10 mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <header className="mb-8 text-center">
            <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
              Get in <span className="font-medium italic text-text/40">Touch</span>
            </h1>
            <p className="text-lg font-medium text-text/50">
              Have questions or feedback? We'd love to hear from you.
            </p>
          </header>

          <div className="relative">
            {submissionResult ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center rounded-[2rem] border border-card-border bg-card-bg p-8 text-center shadow-sm dark:border-white/10 dark:bg-black/90 sm:p-12"
              >
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-card-border bg-card-bg dark:border-white/10 dark:bg-black/40">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </div>
                <h2 className="text-3xl font-black mb-3">Message Received</h2>
                <p className="text-text/50 mb-8 max-w-sm font-medium">
                  Thank you for reaching out. We've assigned a reference ID to your inquiry:
                </p>

                <div
                  className="group/ref relative mb-10 cursor-pointer select-all rounded-[1.1rem] border border-card-border bg-card-bg p-4 font-mono text-lg tracking-widest text-text/80 dark:border-white/10 dark:bg-black/30"
                  title="Click to copy"
                  role="button"
                  aria-label={`Copy reference ID ${submissionResult.referenceId}`}
                  onClick={() => {
                    if (submissionResult?.referenceId) {
                      navigator.clipboard.writeText(submissionResult.referenceId)
                      toast.success('Reference ID copied to clipboard')
                    }
                  }}
                >
                  {submissionResult.referenceId}
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] uppercase font-black tracking-widest text-text/20 opacity-0 group-hover/ref:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    Copy Reference
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
                  <Button
                    onClick={() => {
                      setSubmissionResult(null)
                      resetCaptchaChallenge()
                    }}
                    variant="outline"
                    className="h-12 rounded-[1.1rem] px-8 font-semibold uppercase tracking-[0.14em]"
                  >
                    Send Another
                  </Button>
                  <Link to="/" className="w-full sm:w-auto">
                    <Button
                      variant="primary"
                      className="h-12 w-full rounded-[1.1rem] border border-text/10 bg-text/10 px-8 font-semibold uppercase tracking-[0.14em] text-text hover:bg-text/15"
                    >
                      Return Home
                    </Button>
                  </Link>
                </div>
              </motion.div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="space-y-6 rounded-[2rem] border border-card-border bg-card-bg p-6 shadow-sm dark:border-white/10 dark:bg-black/90 sm:p-10"
              >
                {/* Honeypot field - hidden from users, visible to bots */}
                <div className="absolute opacity-0 -z-10 pointer-events-none" aria-hidden="true">
                  <input
                    type="text"
                    name="address"
                    tabIndex={-1}
                    autoComplete="off"
                    value={formData.address}
                    onChange={handleChange}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text/30 ml-1 flex items-center gap-2">
                      <User className="w-3 h-3 text-text/40" />
                      Full Name
                    </label>
                    <Input
                      required
                      name="name"
                      autoComplete="name"
                      placeholder="Your name"
                      value={formData.name}
                      onChange={handleChange}
                      className="h-12 rounded-[1.1rem] border-card-border bg-card-bg focus:border-white/20 focus:bg-card-bg/80 transition-all duration-300 dark:bg-black/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text/30 ml-1 flex items-center gap-2">
                      <Mail className="w-3 h-3 text-text/40" />
                      Email Address
                    </label>
                    <Input
                      required
                      type="email"
                      inputMode="email"
                      name="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={handleChange}
                      className="h-12 rounded-[1.1rem] border-card-border bg-card-bg focus:border-white/20 focus:bg-card-bg/80 transition-all duration-300 dark:bg-black/30"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text/30 ml-1 flex items-center gap-2">
                    <ShieldCheck className="w-3 h-3 text-text/40" />
                    Username
                  </label>
                  <Input
                    required
                    name="username"
                    autoComplete="username"
                    placeholder="Your vault username"
                    value={formData.username}
                    onChange={handleChange}
                    className="h-12 rounded-[1.1rem] border-card-border bg-card-bg focus:border-white/20 focus:bg-card-bg/80 transition-all duration-300 dark:bg-black/30"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text/30 ml-1 flex items-center gap-2">
                    <Tag className="w-3 h-3 text-text/40" />
                    Query Category
                  </label>
                  <div className="relative group/select">
                    <select
                      required
                      name="subject"
                      value={formData.subject}
                      onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                      className="relative z-10 h-12 w-full cursor-pointer appearance-none rounded-[1.1rem] border border-card-border bg-card-bg px-4 font-medium text-text outline-none transition-all duration-300 focus:border-white/20 focus:bg-card-bg/80 dark:border-white/10 dark:bg-black/30"
                    >
                      <option className="bg-[#0A0A0A] text-text" value="General Inquiry">General Inquiry</option>
                      <option className="bg-[#0A0A0A] text-text" value="Technical Support">Technical Support</option>
                      <option className="bg-[#0A0A0A] text-text" value="Security Vulnerability">Security Vulnerability</option>
                      <option className="bg-[#0A0A0A] text-text" value="Vault Access">Vault Access</option>
                      <option className="bg-[#0A0A0A] text-text" value="Feature Request">Feature Request</option>
                      <option className="bg-[#0A0A0A] text-text" value="Privacy Request">Privacy Request</option>
                      <option className="bg-[#0A0A0A] text-text" value="Other">Other</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-text/30 group-hover/select:text-text/60 transition-colors z-20">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-text/30 flex items-center gap-2">
                      <MessageSquare className="w-3 h-3 text-text/40" />
                      Message
                    </label>
                    <span className={`text-[10px] font-bold ${formData.message.length > 1800 ? 'text-orange-500' : 'text-text/20'}`}>
                      {formData.message.length} / 2000
                    </span>
                  </div>
                  <textarea
                    required
                    name="message"
                    rows={5}
                    maxLength={2000}
                    placeholder="Describe your inquiry in detail..."
                    value={formData.message}
                    onChange={handleChange}
                    className="w-full resize-none rounded-[1.1rem] border border-card-border bg-card-bg p-4 text-sm font-medium leading-relaxed text-text outline-none transition-all duration-300 placeholder:text-text/20 focus:border-white/20 focus:bg-card-bg/80 dark:border-white/10 dark:bg-black/30"
                  />
                </div>

                <RecaptchaField
                  id="contact-recaptcha"
                  token={captchaToken}
                  status={captchaFeedback.status}
                  message={captchaFeedback.message}
                  resetNonce={captchaResetNonce}
                  onChange={handleCaptchaTokenChange}
                  onExpired={handleCaptchaExpired}
                  onError={handleCaptchaError}
                  disabled={isSubmitting}
                />

                <Button
                  type="submit"
                  disabled={isSubmitting || !isCaptchaCompleted}
                  aria-busy={isSubmitting}
                  className="group relative h-14 w-full overflow-hidden rounded-[1.1rem] border border-text/10 bg-text/10 text-lg font-semibold text-text hover:bg-text/15"
                >
                  <div className="relative z-10 flex items-center justify-center gap-2">
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <span>Send Message</span>
                        <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform duration-300" />
                      </>
                    )}
                  </div>
                </Button>
              </form>
            )}
          </div>

        </motion.div>
      </main>
    </div>
  )
}
