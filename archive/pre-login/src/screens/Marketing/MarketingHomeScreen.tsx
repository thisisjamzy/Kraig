'use client';

// The landing page (Dreda.figcraft `Landing / Web` and `Landing / Phone`).
// In order: the dark hero panel (nav inside it, invite-only pill, two-line
// headline, two pill actions, three claims, the phone mock with two floating
// cards) · works-with strip · four feature cards, the second inverted ·
// showcase one (baskets) · showcase two (the ready-to-pay queue) · the accent
// three-steps panel · the invite form · the dark footer. Phone: the same in
// one column, no sideways scrolling.

import Link from 'next/link';
import { Calendar, Check, CheckCircle2, ChevronDown, ListOrdered, Mail, RefreshCw, WalletCards } from 'lucide-react';
import { useLogic } from '@/src/logic/marketing/useLogic';
import { InstallDialog } from '@/src/widgets/InstallDialog/InstallDialog';
import { Logo } from '@/src/widgets/Logo/Logo';
import { AccentPanel, Eyebrow, FloatCard, HeroPanel, PhoneMock, PillButton } from '@/src/widgets/Marketing/Marketing';
import styles from './MarketingHomeScreen.module.css';

const FEATURES = [
  { icon: WalletCards, title: 'Plan into baskets', text: 'Each basket holds planned money. Spend from it and the app keeps showing what is left in it.' },
  { icon: ListOrdered, title: 'Bills in the order you pay them', text: 'Mark one paid and every balance follows. You stop guessing which bill is next.', inverted: true },
  { icon: RefreshCw, title: 'Count a wallet, find the gap', text: 'Compare what you recorded with what you actually hold, then explain the difference once and move on.' },
  { icon: Calendar, title: 'Tasks live here too', text: 'Switch to Time mode for today’s work and your projects, without leaving your money behind.' },
];

const STEPS = [
  { title: 'Add your wallets', text: 'Bank, MoMo, Orange, cash, savings. Count each one once and the balance is real from then on.' },
  { title: 'Plan the month into baskets', text: 'Bring last month in from a sheet if you keep one, or start with the four or five that always come back.' },
  { title: 'Record as you go', text: 'Pay from the queue, count a wallet when something feels off, and close the month in a few minutes.' },
];

const QUEUE = [
  { name: 'Rent', due: 'Due 15 Nov', wallet: 'MTN MoMo' },
  { name: 'Electricity', due: 'Due 15 Nov', wallet: 'MTN MoMo' },
  { name: 'School fees', due: 'Due 15 Nov', wallet: 'MTN MoMo' },
];

export function MarketingHomeScreen() {
  const { installOpen, openInstall, closeInstall, form } = useLogic();

  return (
    <>
      <main className={styles.page}>
        <HeroPanel>
          <nav className={styles.nav} aria-label="Main">
            <Logo height={32} variant="dark" />
            <span className={styles.navLinks}>
              <a href="#how">How it works</a>
              <a href="#who">Who it is for</a>
              <a href="#invite">Questions</a>
            </span>
            <span className={styles.navActions}>
              <Link href="/sign-in" className={styles.signIn}>
                Sign in
              </Link>
              <a href="#invite" className={styles.navInvite}>
                Request an invite
              </a>
            </span>
          </nav>

          <div className={styles.heroGrid}>
            <div className={styles.heroCopy}>
              <Eyebrow tone="dark">Invite only · Beta</Eyebrow>
              <h1 className={styles.headline}>
                Know what you can <span className={styles.headlineAccent}>spend today.</span>
              </h1>
              <p className={styles.lead}>Dreda puts every wallet, basket, bill and task in one calm view. Plan the month, pay from a queue, and close it in minutes.</p>
              <div className={styles.heroActions}>
                <PillButton href="#invite">Request an invite</PillButton>
                <PillButton href="/sign-up" tone="outline">
                  I have an invite code
                </PillButton>
              </div>
              <ul className={styles.claims}>
                <li>
                  <strong>Invite only</strong>a few people at a time
                </li>
                <li>
                  <strong>XAF first</strong>MoMo, Orange, bank, cash
                </li>
                <li>
                  <strong>Works offline</strong>your last view always opens
                </li>
              </ul>
            </div>
            <div className={styles.heroVisual}>
              <PhoneMock>
                <FloatCard position="top">
                  <span className={styles.floatRow}>
                    <CheckCircle2 size={16} strokeWidth={2} aria-hidden /> 3 bills ready to pay
                  </span>
                </FloatCard>
                <FloatCard position="bottom">
                  <span className={styles.floatLabel}>Left in baskets</span>
                  <strong className={styles.floatValue}>304,700</strong>
                </FloatCard>
              </PhoneMock>
            </div>
          </div>
        </HeroPanel>

        <section className={styles.strip} aria-label="Works with">
          <span className={styles.stripLabel}>Works with what you already use</span>
          {['MTN MoMo', 'Orange Money', 'Bank transfer', 'Cash', 'Savings'].map((x) => (
            <span key={x} className={styles.stripItem}>
              {x}
            </span>
          ))}
        </section>

        <section id="how" className={styles.section}>
          <Eyebrow>What you get</Eyebrow>
          <h2 className={styles.sectionTitle}>Everything the month needs, nothing it does not</h2>
          <div className={styles.features}>
            {FEATURES.map(({ icon: Icon, title, text, inverted }) => (
              <article key={title} className={styles.feature} data-inverted={inverted || undefined}>
                <span className={styles.featureIcon} aria-hidden>
                  <Icon size={18} strokeWidth={2} />
                </span>
                <h3 className={styles.featureTitle}>{title}</h3>
                <p className={styles.featureText}>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="who" className={`${styles.section} ${styles.showcase}`}>
          <div className={styles.showcaseVisual}>
            <span className={styles.blob} data-tone="brand" aria-hidden />
            <PhoneMock />
          </div>
          <div className={styles.showcaseCopy}>
            <Eyebrow tone="accent">The month</Eyebrow>
            <h2 className={styles.sectionTitle}>Give every franc a job before it runs off</h2>
            <p className={styles.sectionText}>
              Share the month out into baskets: rent, transport, food, the ones that come back every month. Spend from a basket and Dreda keeps showing what is left in it, so the question stops being how much is in the bank.
            </p>
            <ul className={styles.checks}>
              {['Payments, allowances and money set aside, kept apart', 'Move money between baskets when life changes the plan', 'Print a basket as a receipt to share the budget with someone'].map((x) => (
                <li key={x}>
                  <Check size={16} strokeWidth={2.25} aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={`${styles.section} ${styles.showcase} ${styles.showcaseFlip}`}>
          <div className={styles.showcaseCopy}>
            <Eyebrow>When the bill lands</Eyebrow>
            <h2 className={styles.sectionTitle}>Pay from a queue, not from memory</h2>
            <p className={styles.sectionText}>Everything with a due date lines up in the order you will pay it, with the wallet it comes out of already chosen. Mark one paid and the basket, the wallet and the month all follow.</p>
            <div>
              <PillButton href="#invite" tone="ink">
                Request an invite
              </PillButton>
            </div>
          </div>
          <div className={styles.showcaseVisual}>
            <span className={styles.blob} data-tone="accent" aria-hidden />
            <div className={styles.queue} aria-hidden>
              <div className={styles.queueHead}>
                <strong>Ready to pay</strong>
                <span>3 due this week</span>
              </div>
              {QUEUE.map((q) => (
                <div key={q.name} className={styles.queueRow}>
                  <span className={styles.queueCheck}>
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <span className={styles.queueName}>
                    {q.name}
                    <small>{q.due}</small>
                  </span>
                  <span className={styles.queueWallet}>
                    {q.wallet}
                    <ChevronDown size={14} strokeWidth={2} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className={styles.section}>
          <AccentPanel>
            <div className={styles.steps}>
              <div className={styles.total} aria-hidden>
                <span className={styles.totalLabel}>Total across 7 wallets</span>
                <strong className={styles.totalValue}>750,700</strong>
                <span className={styles.totalBars}>
                  <span />
                  <span />
                  <span />
                </span>
                <span className={styles.totalMeta}>Bank · Mobile money · Cash</span>
              </div>
              <div className={styles.stepsCopy}>
                <h2 className={styles.sectionTitle}>Start in three steps</h2>
                <ol className={styles.stepList}>
                  {STEPS.map((step, i) => (
                    <li key={step.title}>
                      <span className={styles.stepNumber}>{i + 1}</span>
                      <span>
                        <strong>{step.title}</strong>
                        <small>{step.text}</small>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </AccentPanel>
        </div>

        <section id="invite" className={`${styles.section} ${styles.invite}`}>
          <h2 className={styles.sectionTitle}>{form.requested ? 'Invite requested' : 'Request an invite'}</h2>
          <p className={styles.sectionText}>
            {form.requested
              ? `Thanks${form.name.trim() ? `, ${form.name.trim().split(' ')[0]}` : ''}. We will write to ${form.email.trim()} when a place opens.`
              : 'Two questions, and we write back when a place opens. We let people in a few at a time so we can help each one set up.'}
          </p>
          {!form.requested && (
            <form className={styles.form} onSubmit={form.submit} noValidate>
              <label className={styles.field}>
                <span>Email</span>
                <span className={styles.inputWrap} data-invalid={form.error ? '' : undefined}>
                  <Mail size={16} strokeWidth={2} aria-hidden />
                  <input type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={(e) => form.setEmail(e.target.value)} aria-invalid={form.error ? true : undefined} />
                </span>
                {form.error && (
                  <span className={styles.error} role="alert">
                    {form.error}
                  </span>
                )}
              </label>
              <label className={styles.field}>
                <span>Your name</span>
                <span className={styles.inputWrap}>
                  <input autoComplete="name" placeholder="Ada Mbeki" value={form.name} onChange={(e) => form.setName(e.target.value)} />
                </span>
              </label>
              <label className={styles.field}>
                <span>What do you want to sort out first?</span>
                <span className={styles.inputWrap}>
                  <input placeholder="Bills keep catching me out" value={form.first} onChange={(e) => form.setFirst(e.target.value)} />
                </span>
              </label>
              <label className={styles.switchRow}>
                <input type="checkbox" role="switch" className={styles.switch} checked={form.notify} onChange={(e) => form.setNotify(e.target.checked)} />
                Email me when my invite is ready. Nothing else.
              </label>
              <PillButton type="submit" tone="brand">
                Request an invite
              </PillButton>
              <p className={styles.formNote}>
                Invites go out on Mondays and Thursdays. Already have a code? <Link href="/sign-up">Sign up</Link>
              </p>
            </form>
          )}
        </section>

        <footer className={styles.footer}>
          <div className={styles.footerGrid}>
            <div className={styles.footerBrand}>
              <Logo height={32} variant="dark" />
              <p>Money and time in one calm view. Built in Douala, for people paid in XAF.</p>
            </div>
            <nav className={styles.footerCols} aria-label="Footer">
              <div>
                <span>Product</span>
                <a href="#how">How it works</a>
                <a href="#who">Who it is for</a>
                <button type="button" onClick={openInstall}>
                  Save to home screen
                </button>
              </div>
              <div>
                <span>Account</span>
                <a href="#invite">Request an invite</a>
                <Link href="/sign-up">I have a code</Link>
                <Link href="/sign-in">Sign in</Link>
              </div>
              <div>
                <span>Company</span>
                <a href="mailto:hello@dreda.app">hello@dreda.app</a>
              </div>
            </nav>
          </div>
          <div className={styles.footerBase}>
            <span>© {new Date().getFullYear()} Dreda</span>
            <span>Invite only while in beta</span>
          </div>
        </footer>
      </main>

      <InstallDialog open={installOpen} onClose={closeInstall} />
    </>
  );
}
