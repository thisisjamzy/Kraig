'use client';
import { InstallDialog } from '@/src/widgets/InstallDialog/InstallDialog';
import { useLogic } from '@/src/logic/marketing/useLogic';
import { useStrings } from '@/src/strings/useStrings';
import { Logo } from '@/src/widgets/Logo/Logo';
import styles from './MarketingHomeScreen.module.css';

export function MarketingHomeScreen() {
  const strings = useStrings();
  const { installOpen, openInstall, closeInstall } = useLogic();

  return (
    <>
      <main>
        <section className={styles.hero}>
          <div>
            <div className={`${styles.logo}  mb-6`}>
              <Logo height={40} alt="Dreda home screen" />
            </div>
            <div className={styles.eyebrow}>
              <span className={styles.eyebrowLine} />
              {strings.marketing.eyebrow}
            </div>
            <h1 className={styles.headline}>{strings.marketing.headline}</h1>
            <p className={styles.lead}>{strings.marketing.lead}</p>
            <p className={styles.body}>{strings.marketing.body}</p>
            <div className={styles.actions}>
              <a href="/sign-up" className={styles.primaryButton}>
                {strings.marketing.getStarted} <span aria-hidden="true">&rarr;</span>
              </a>
              <button type="button" className={styles.secondaryButton} onClick={openInstall}>
                {strings.marketing.howToInstall}
              </button>
            </div>
          </div>

          <div className={styles.visual}>
            <div className={styles.visualPanel}>
              <img className={styles.visualPanelImg} src={'/mock1.jpg'} alt="Dreda home screen" />
            </div>
          </div>
        </section>
      </main>

      <InstallDialog open={installOpen} onClose={closeInstall} />
    </>
  );
}
