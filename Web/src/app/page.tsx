import styles from "./page.module.css";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignedOut, SignInButton } from "@clerk/nextjs";
import { RedirectIfSignedIn } from "@/app/components/RedirectIfSignedIn";

const AFTER_AUTH_URL = "/dashboard";

export default async function Home() {
    const { userId } = await auth();
    if (userId) {
        redirect(AFTER_AUTH_URL);
    }

    return (
        <div className={styles.page}>
            <RedirectIfSignedIn to={AFTER_AUTH_URL} />
            <header className={styles.authHeader}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/Linquiq title.png"
                    alt="Linquiq"
                    className={styles.authLogo}
                />
                <div className={styles.authButtons}>
                    <SignedOut>
                        <SignInButton
                            forceRedirectUrl={AFTER_AUTH_URL}
                            fallbackRedirectUrl={AFTER_AUTH_URL}
                        >
                            <button type="button" className={styles.authBtn}>
                                Sign in
                            </button>
                        </SignInButton>
                    </SignedOut>
                </div>
            </header>

            <main className={styles.landingMain}>
                <section className={styles.heroSection}>
                    <h2 className={styles.heroHeading}>Capture Your Info</h2>
                    <p className={styles.heroDescription}>
                        Create your personalized layout of information from
                        conferences and expo events that has links, business
                        cards, photos, and detailed description of your
                        links such as date, location, and type.
                    </p>
                </section>
            </main>

            <footer className={styles.landingFooter}>
                © 2026 GLOBIDEA LLC. Linquiq.{" "}
                <a href="/privacy" className={styles.footerLink}>
                    Privacy Policy
                </a>
                {" · "}
                <a href="/terms" className={styles.footerLink}>
                    Tester Terms
                </a>
            </footer>
        </div>
    );
}
