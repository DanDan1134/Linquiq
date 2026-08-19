import type { Metadata } from "next";
import Link from "next/link";
import styles from "../privacy/privacy.module.css";

export const metadata: Metadata = {
  title: "Tester Terms | Linquiq",
  description: "Terms for invited Linquiq TestFlight testers.",
};

export default function TesterTermsPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/Linquiq title.png"
          alt="Linquiq"
          className={styles.logo}
        />
        <Link href="/" className={styles.homeLink}>
          Home
        </Link>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>Tester Terms</h1>
        <p className={styles.meta}>
          <strong>Last updated:</strong> August 19, 2026
          <br />
          <strong>Operator:</strong> GLOBIDEA LLC
          <br />
          These terms apply to invited TestFlight and closed-web testing only.
        </p>

        <section className={styles.section}>
          <h2>1. Who may test</h2>
          <p>
            You must be 18 or older. Access is by invitation. Do not share your
            TestFlight link, Clerk invite, or login with anyone else.
          </p>
        </section>

        <section className={styles.section}>
          <h2>2. What you may upload</h2>
          <p>
            Upload only content you have the right to use. Do not upload illegal
            content, other people&apos;s confidential files, or material you do
            not own. There is no sharing feature; do not open files from
            strangers.
          </p>
        </section>

        <section className={styles.section}>
          <h2>3. Photos, badges, and voice</h2>
          <p>
            Conference photos and voice notes can include other people. Get their
            consent before you capture them. We strip GPS from photos when we
            can; do not rely on that as consent.
          </p>
        </section>

        <section className={styles.section}>
          <h2>4. Data may be wiped</h2>
          <p>
            This is a test. We may delete accounts and files at any time. Do not
            store the only copy of important data in Linquiq.
          </p>
        </section>

        <section className={styles.section}>
          <h2>5. File links</h2>
          <p>
            Preview download links expire quickly and work without login until
            they expire. Do not paste them into Slack, email, or chat.
          </p>
        </section>

        <section className={styles.section}>
          <h2>6. Contact</h2>
          <p>
            Questions:{" "}
            <a href="mailto:privacy@linquiq.com">privacy@linquiq.com</a>
            {" "}or{" "}
            <a href="https://www.linquiq.com">https://www.linquiq.com</a>.
            Privacy Policy: <Link href="/privacy">/privacy</Link>.
          </p>
        </section>

        <footer className={styles.footer}>
          © {new Date().getFullYear()} GLOBIDEA LLC. Linquiq.
        </footer>
      </main>
    </div>
  );
}
