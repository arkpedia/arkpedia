import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import PageHeader from '@/components/ui/PageHeader';
import patreonSupporters from '@/config/patreon_supporters.json';

export default function SupportPage() {
  const [showJoinModal, setShowJoinModal] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const joinButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showJoinModal) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [showJoinModal]);

  return (
    <>
      <Head><title>Support — Arkpedia</title></Head>

      <PageHeader eyebrow="Rhodes Island // Support" title="Support" />

      <main>
        <section className="op-section">
          <p className="support-intro">
            There can be a lot more features for the site, but the site will also become more
            expensive to host if so. If you&apos;d like to support, you can support in three ways!
          </p>

          <div className="support-options-row">
            <div className="support-option">
              <h3>For Free!</h3>
              <p className="support-copy">Be more active in the communities I have.</p>
              <div className="support-social-row">
                <a href="https://discord.gg/kukkikaze" target="_blank" rel="noopener noreferrer" className="btn support-social-link" title="Discord">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="26" height="26">
                    <rect x="4" y="6" width="16" height="12" rx="5" />
                    <circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" />
                    <circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" />
                  </svg>
                  <span>Discord</span>
                </a>
                <a href="https://youtube.com/kukkikaze" target="_blank" rel="noopener noreferrer" className="btn support-social-link" title="YouTube">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="26" height="26">
                    <rect x="3" y="6" width="18" height="12" rx="4" />
                    <path d="M10 9.5 L15 12 L10 14.5 Z" fill="currentColor" stroke="none" />
                  </svg>
                  <span>YouTube</span>
                </a>
                <a href="https://twitch.com/kukkikaze" target="_blank" rel="noopener noreferrer" className="btn support-social-link" title="Twitch">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="26" height="26">
                    <path d="M5 3 L4 7 V19 H8 V21 L11 19 H15 L20 14 V3 Z" />
                    <path d="M13 7 V12 M17 7 V12" strokeLinecap="round" />
                  </svg>
                  <span>Twitch</span>
                </a>
              </div>
            </div>

            <div className="support-option">
              <h3>As Free Labour <span aria-hidden="true">😈</span></h3>
              <p className="support-copy">
                Send your feedback and bugs to this Google Form, or join the team of unpaid people to make this
                site bigger and better!
              </p>
              <div className="support-social-row">
                <a href="https://docs.google.com/forms/d/e/1FAIpQLScZFB0C0ZlejjrDqrLCm1_I9w4D4F_kmhOtNQJlQ7hIriVIRg/viewform?usp=sharing&ouid=112457249459874066057" target="_blank" rel="noopener noreferrer" className="btn support-social-link" title="Feedback Form">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="26" height="26">
                    <rect x="5" y="3" width="14" height="18" rx="2" />
                    <path d="M8 8 H16 M8 12 H16 M8 16 H13" strokeLinecap="round" />
                  </svg>
                  <span>Feedback Form</span>
                </a>
                <button ref={joinButtonRef} type="button" className="btn support-social-link" title="Join the Team" onClick={() => setShowJoinModal(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="26" height="26">
                    <circle cx="8.5" cy="8" r="3" />
                    <path d="M2.5 20 C2.5 15.5 5 13.5 8.5 13.5 C11.5 13.5 13.7 15 14.3 18" strokeLinecap="round" />
                    <circle cx="16" cy="9" r="2.4" />
                    <path d="M15 13.8 C18.3 14.2 20 16 20 19.5" strokeLinecap="round" />
                  </svg>
                  <span>Join the Team</span>
                </button>
              </div>
            </div>

            <div className="support-option">
              <h3>Or Support the Page Expenses <span aria-hidden="true">🥲</span></h3>
              <p className="support-copy">Benefits are given for paid supporters in the near future!</p>
              <div className="support-social-row">
                <a href="https://patreon.com/kukkikaze" target="_blank" rel="noopener noreferrer" className="btn support-social-link" title="Patreon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="26" height="26">
                    <circle cx="14" cy="10" r="6" />
                    <rect x="4" y="4" width="3" height="16" fill="currentColor" stroke="none" />
                  </svg>
                  <span>Patreon</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="op-section">
          <h2>Thank You to My Supporters</h2>
          <div className="supporters-tiers">
            {patreonSupporters['supporter-tier'].map(tier => (
              <div key={tier.id} className="supporter-tier">
                <h3>{tier.name}</h3>
                <ul className="supporter-list">
                  {tier.supporters.map(supporter => <li key={supporter}>{supporter}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>

      <dialog
        ref={dialogRef}
        className="modal-box support-dialog"
        aria-labelledby="join-team-title"
        onClose={() => { setShowJoinModal(false); joinButtonRef.current?.focus(); }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
            setShowJoinModal(false);
          }
        }}
      >
        <h2 id="join-team-title">Join the Team</h2>
        <p>
          If you&apos;d like to be a dedicated team member, please message <strong>@kukkikaze</strong> on Discord.
          Just let me know that you have interest and let me also know what ways you wish to contribute or help!
        </p>
        <div className="modal-actions">
          <button type="button" className="primary" onClick={() => setShowJoinModal(false)}>
            Got it
          </button>
        </div>
      </dialog>
    </>
  );
}
