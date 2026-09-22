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
          <strong>Last updated:</strong> August 25, 2026
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
              <strong>Name</strong> — when provided by Google sign-in
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
              <strong>Search queries</strong> — in-app search terms sent to our
              servers so we can return matches. Hosting logs may retain those
              queries for a short time.
            </li>
            <li>
              <strong>On-device copies</strong> — the mobile app stores metadata
              and file bytes locally (SQLite and app files) so you can work
              offline. Those copies are wiped on log out.
            </li>
            <li>
              <strong>Text extracts</strong> — for searchable notes we may store
              a short extract of the file text in our database, in addition to
              the file in object storage.
            </li>
          </ul>
          <p>
            We only collect content you choose to create, upload, or submit.
            Device permissions (such as camera, microphone, or photo library)
            are used solely to capture or select content you decide to save.
            Photos, badges, and voice notes can include other people. You are
            responsible for getting their consent before you capture them.
          </p>
        </section>

        <section className={styles.section}>
          <h2>3. Information We Do Not Collect</h2>
          <p>Unless we notify you otherwise and update this policy, we do not collect:</p>
          <ul>
            <li>
              Device GPS. We do not request location permission. Photos may
              originally contain GPS in EXIF; we strip that metadata when we
              process images. A photo of a place can still show where you were.
            </li>
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
              (email/password, and Google when enabled).
            </li>
            <li>
              <strong>Vercel</strong> — hosts the website and API.
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
            obligations. Google may also process information when you
            choose to sign in with Google, under Google policies.
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
            You can delete your account and associated files in the mobile app
            under Settings. For other privacy requests, contact GLOBIDEA LLC
            using the email address on your tester invitation or the email
            you used to create your account. We may need to verify your
            identity before completing a request.
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
            Linquiq is not directed to children under 13. Closed TestFlight
            testing is limited to invited testers who are 18 or older (see{" "}
            <Link href="/terms">Tester Terms</Link>). We do not knowingly
            collect personal information from children under 13. If you believe
            a child under 13 has provided us personal information, contact
            GLOBIDEA LLC using the email on your tester invitation or the email
            associated with the account, and we will take steps to delete it.
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
            <strong>GLOBIDEA LLC</strong> using the email address on your
            tester invitation or the email associated with your account, or
            through the product site{" "}
            <a href="https://linquiq.com">https://linquiq.com</a>.
          </p>
        </section>

        <footer className={styles.footer}>
          © {new Date().getFullYear()} GLOBIDEA LLC. Linquiq.
        </footer>
      </main>
    </div>
  );
}
