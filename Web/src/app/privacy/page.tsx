import type { Metadata } from "next";
import Link from "next/link";
import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy | Linquiq",
  description:
    "Privacy Policy for Linquiq by GLOBIDEA LLC. How we collect, use, and protect your information.",
};

export default function PrivacyPolicyPage() {
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
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.meta}>
          <strong>Last updated:</strong> July 13, 2026
          <br />
          <strong>Operator:</strong> GLOBIDEA LLC (“we,” “us,” or “our”)
          <br />
          <strong>Product:</strong> Linquiq (mobile and web)
        </p>

        <section className={styles.section}>
          <h2>1. Overview</h2>
          <p>
            Linquiq is a networking capture app for conferences and expos. It
            helps you capture and organize notes, photos, voice recordings,
            files, and “linqs” (linked bundles of items), and sync that content
            across your devices.
          </p>
          <p>
            This Privacy Policy explains what personal information we collect,
            how we use it, and your choices. It applies to the Linquiq mobile
            app, website, and related services (the “Service”).
          </p>
        </section>

        <section className={styles.section}>
          <h2>2. Information We Collect</h2>
          <p>
            We collect the following categories of information when you use
            Linquiq:
          </p>
          <ul>
            <li>
              <strong>Email address</strong> — used to create and sign in to
              your account.
            </li>
            <li>
              <strong>Name</strong> — when provided by Apple or Google sign-in
              (or if you enter it yourself).
            </li>
            <li>
              <strong>User ID / account ID</strong> — an account identifier
              created by our authentication provider (Clerk) to recognize your
              session and account.
            </li>
            <li>
              <strong>Photos or videos</strong> — content you choose to capture
              or upload.
            </li>
            <li>
              <strong>Audio data</strong> — voice notes or recordings you create
              in the app.
            </li>
            <li>
              <strong>Other user content</strong> — notes, files, linqs, and
              related metadata you save (for example titles, notes, dates, or
              types you assign).
            </li>
            <li>
              <strong>Search history</strong> — in-app search queries you submit
              that are sent to our servers so we can return results from your
              content.
            </li>
          </ul>
          <p>
            We only collect content you choose to create, upload, or submit.
            Device permissions (such as camera, microphone, or photo library)
            are used solely to capture or select content you decide to save.
          </p>
        </section>

        <section className={styles.section}>
          <h2>3. Information We Do Not Collect</h2>
          <p>Unless we notify you otherwise and update this policy, we do not collect:</p>
          <ul>
            <li>Precise or coarse location</li>
            <li>Contacts from your device address book</li>
            <li>Payment or financial information</li>
            <li>Health or fitness data</li>
            <li>Advertising identifiers used for ads</li>
            <li>Browsing history outside the Linquiq app or website</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>4. How We Use Information</h2>
          <p>We use the information above only for App Functionality, including to:</p>
          <ul>
            <li>Authenticate you and maintain your account</li>
            <li>Save, sync, display, and organize your content</li>
            <li>Power in-app search and related features</li>
            <li>Provide customer support and respond to requests</li>
            <li>Protect the security and integrity of the Service</li>
          </ul>
          <p>
            We do not use your personal information for third-party advertising,
            and we do not track you across other apps or websites for advertising
            purposes.
          </p>
        </section>

        <section className={styles.section}>
          <h2>5. We Do Not Sell Personal Data</h2>
          <p>
            We do not sell your personal information. We also do not share it
            with third parties for their own advertising or cross-app tracking.
          </p>
        </section>

        <section className={styles.section}>
          <h2>6. Service Providers (Processors)</h2>
          <p>
            We use trusted service providers that process information on our
            behalf to operate Linquiq. These may include:
          </p>
          <ul>
            <li>
              <strong>Clerk</strong> — authentication and account sign-in
              (email/password, Apple, Google).
            </li>
            <li>
              <strong>Cloud hosting, database, and object storage providers</strong>{" "}
              — used to run our API, store account-related data, and store files
              you upload (for example cloud object storage such as Amazon S3).
            </li>
          </ul>
          <p>
            These providers are authorized to process data only as needed to
            provide services to us, under their own security and privacy
            obligations. Apple and Google may also process information when you
            choose to sign in with those services, under their respective
            policies.
          </p>
        </section>

        <section className={styles.section}>
          <h2>7. Data Retention</h2>
          <p>
            We keep your account information and content while your account is
            active and as needed to provide the Service. If you request deletion
            of your account or specific data, we will delete or anonymize that
            information within a reasonable time, except where we must retain
            limited records for legal, security, or operational reasons (for
            example backups that rotate on a schedule).
          </p>
        </section>

        <section className={styles.section}>
          <h2>8. Your Rights and Choices</h2>
          <p>Depending on where you live, you may have rights to:</p>
          <ul>
            <li>Access the personal information we hold about you</li>
            <li>Update or correct account information</li>
            <li>Request deletion of your account and associated content</li>
          </ul>
          <p>
            You can update some account details in the app or through your sign-in
            provider. To request access or deletion, contact us through the
            Linquiq website or in-app support channels using the email address
            associated with your account, and describe your request. We may need
            to verify your identity before completing it.
          </p>
        </section>

        <section className={styles.section}>
          <h2>9. Security</h2>
          <p>
            We use reasonable administrative, technical, and organizational
            safeguards designed to protect personal information. No method of
            transmission or storage is completely secure, and we cannot
            guarantee absolute security.
          </p>
        </section>

        <section className={styles.section}>
          <h2>10. International Users</h2>
          <p>
            Linquiq may be operated using servers and service providers located
            in the United States and other jurisdictions. If you use the Service
            from outside those locations, your information may be transferred to
            and processed in places where privacy laws may differ from those in
            your country.
          </p>
        </section>

        <section className={styles.section}>
          <h2>11. Children</h2>
          <p>
            Linquiq is not directed to children under 13. We do not knowingly
            collect personal information from children under 13. If you believe
            a child under 13 has provided us personal information, contact us
            through the Linquiq website or in-app support channels and we will
            take steps to delete it.
          </p>
        </section>

        <section className={styles.section}>
          <h2>12. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. When we do, we
            will change the “Last updated” date at the top of this page. If
            changes are material, we may provide additional notice in the app or
            by email when appropriate. Continued use of the Service after an
            update means you acknowledge the revised policy.
          </p>
        </section>

        <section className={styles.section}>
          <h2>13. Contact Us</h2>
          <p>
            Questions about this Privacy Policy or your data can be directed to{" "}
            <strong>GLOBIDEA LLC</strong> through the Linquiq product site at{" "}
            <a href="https://www.linquiq.com">https://www.linquiq.com</a>.
          </p>
        </section>

        <footer className={styles.footer}>
          © {new Date().getFullYear()} GLOBIDEA LLC. Linquiq.
        </footer>
      </main>
    </div>
  );
}
