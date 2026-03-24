import type { Metadata } from 'next';
import Link from 'next/link';
import { CookiePreferencesSection } from '@/components/legal/CookiePreferencesSection';

export const metadata: Metadata = {
  title: 'Cookie Policy | Baby Bloom',
};

export default function CookiePolicyPage() {
  return (
    <article>
      <header className="mb-8 border-b border-slate-200 pb-6">
        <h1 className="text-2xl font-bold text-slate-900">Cookie Policy</h1>
        <p className="mt-1 text-xs text-slate-400">Baby Bloom Sydney Pty Ltd | ABN 17 463 812 867</p>
        <p className="mt-0.5 text-xs text-slate-400">Version 1.0 &mdash; Effective 13 March 2026</p>
      </header>

      <div className="prose prose-sm prose-slate max-w-none prose-headings:text-base prose-headings:font-semibold prose-p:text-slate-600 prose-li:text-slate-600 prose-th:text-xs prose-th:font-semibold prose-th:text-slate-500 prose-th:uppercase prose-th:tracking-wide prose-td:text-xs prose-td:text-slate-600">

        <section>
          <h2>1. Introduction</h2>
          <p>This Cookie Policy (&ldquo;Policy&rdquo;) explains how Baby Bloom Sydney Pty Ltd (&ldquo;Baby Bloom,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) uses cookies and similar tracking technologies when you access or use our website at babybloomsydney.com.au and our web application (collectively, the &ldquo;Platform&rdquo;).</p>
          <p>This Policy should be read in conjunction with our <Link href="/legal/privacy-policy">Privacy Policy</Link> and applicable <Link href="/legal/client-terms">Terms of Service</Link>. In the event of any conflict between this Policy and the Privacy Policy, the Privacy Policy shall prevail.</p>
          <p>By continuing to use the Platform, you acknowledge that you have read and understood this Policy. You may manage your cookie preferences at any time via the cookie consent banner accessible from the footer of the Platform.</p>
        </section>

        <hr />

        <section>
          <h2>2. What Are Cookies?</h2>
          <p>Cookies are small text files that are placed on your device (computer, tablet, or mobile phone) when you visit a website. Cookies are widely used to make websites function efficiently, to improve user experience, and to provide reporting information to website operators. Cookies set by the website operator are called &ldquo;first-party cookies.&rdquo; Cookies set by parties other than the website operator are called &ldquo;third-party cookies.&rdquo;</p>
          <p>Cookies may be &ldquo;session cookies&rdquo; (which are deleted when you close your browser) or &ldquo;persistent cookies&rdquo; (which remain on your device for a set period or until you delete them manually).</p>
        </section>

        <hr />

        <section>
          <h2>3. Categories of Cookies We Use</h2>

          <h3>3.1 Essential Cookies (Strictly Necessary)</h3>
          <p>These cookies are required for the Platform to function correctly. They enable core functionality such as user authentication, session management, security protections, and payment processing. Essential cookies cannot be disabled without impairing the Platform&rsquo;s functionality. No consent is required for essential cookies under the Privacy Act 1988 (Cth) or the Spam Act 2003 (Cth).</p>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Cookie Name</th>
                  <th>Provider</th>
                  <th>Purpose</th>
                  <th>Type</th>
                  <th>Expiry</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>sb-*-auth-token</td>
                  <td>Baby Bloom (Supabase)</td>
                  <td>User authentication and session management. Required to maintain login state across page navigations.</td>
                  <td>First-party</td>
                  <td>Session / 7 days</td>
                </tr>
                <tr>
                  <td>baby_bloom_consent_preferences</td>
                  <td>Baby Bloom</td>
                  <td>Stores your cookie consent preferences to avoid repeated consent prompts.</td>
                  <td>First-party</td>
                  <td>12 months</td>
                </tr>
                <tr>
                  <td>__stripe_mid</td>
                  <td>Stripe, Inc. (USA)</td>
                  <td>Fraud prevention and payment security. Required for PCI DSS compliance when processing payments.</td>
                  <td>Third-party</td>
                  <td>1 year</td>
                </tr>
                <tr>
                  <td>__stripe_sid</td>
                  <td>Stripe, Inc. (USA)</td>
                  <td>Payment session identification and fraud detection during active checkout sessions.</td>
                  <td>Third-party</td>
                  <td>30 minutes</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3>3.2 Analytics Cookies (Performance)</h3>
          <p>Analytics cookies collect information about how visitors interact with the Platform, including which pages are visited most frequently, how long visitors spend on each page, and any error messages encountered. This information is aggregated and anonymised where possible. Analytics cookies are set only with your express consent.</p>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Cookie Name</th>
                  <th>Provider</th>
                  <th>Purpose</th>
                  <th>Type</th>
                  <th>Expiry</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>_ga</td>
                  <td>Google LLC (USA)</td>
                  <td>Distinguishes unique users by assigning a randomly generated identifier. Used to calculate visitor, session, and campaign data for site analytics reports.</td>
                  <td>Third-party</td>
                  <td>2 years</td>
                </tr>
                <tr>
                  <td>_gid</td>
                  <td>Google LLC (USA)</td>
                  <td>Distinguishes unique users within a 24-hour period. Used to throttle request rate and group page views into sessions.</td>
                  <td>Third-party</td>
                  <td>24 hours</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3>3.3 Marketing Cookies (Advertising &amp; Social)</h3>
          <p>Marketing cookies are used to track visitors across websites for the purpose of displaying advertisements that are relevant and engaging. These cookies may also be used to measure the effectiveness of advertising campaigns and to limit the number of times you see a particular advertisement. Marketing cookies are set only with your express consent.</p>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Cookie Name</th>
                  <th>Provider</th>
                  <th>Purpose</th>
                  <th>Type</th>
                  <th>Expiry</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>_fbp</td>
                  <td>Meta Platforms, Inc. (USA)</td>
                  <td>Tracks user interactions for social sharing, community engagement measurement, and targeted advertising within the Meta advertising network.</td>
                  <td>Third-party</td>
                  <td>90 days</td>
                </tr>
                <tr>
                  <td>_gcl_au</td>
                  <td>Google LLC (USA)</td>
                  <td>Conversion tracking for Google Ads. Stores a unique identifier to attribute conversions to specific advertising campaigns.</td>
                  <td>Third-party</td>
                  <td>90 days</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <hr />

        <section>
          <h2>4. Managing Your Cookie Preferences</h2>
          <p>When you first access the Platform, a cookie consent banner is displayed offering three options:</p>
          <ol>
            <li><strong>Accept All Cookies</strong> &mdash; enables essential, analytics, and marketing cookies.</li>
            <li><strong>Reject Non-Essential</strong> &mdash; enables essential cookies only. Analytics and marketing cookies are not set.</li>
            <li><strong>Manage Preferences</strong> &mdash; opens a preferences panel allowing granular control over each cookie category.</li>
          </ol>
          <p><strong>Default behaviour:</strong> If you do not interact with the consent banner, only essential cookies are set. Non-essential cookies are <em>not</em> loaded until you actively consent. This is consistent with the principle of data minimisation under Australian Privacy Principle (APP) 3.</p>
          <p>Within the &ldquo;Manage Preferences&rdquo; panel, you may independently toggle:</p>
          <ul>
            <li><strong>Essential cookies</strong> &mdash; always enabled (cannot be disabled).</li>
            <li><strong>Analytics cookies</strong> (Google Analytics) &mdash; enable or disable.</li>
            <li><strong>Marketing cookies</strong> (Google Ads, Meta Pixel) &mdash; enable or disable.</li>
          </ul>
          <p>You may change your cookie preferences at any time by clicking the cookie settings icon displayed in the footer of the Platform. Changes take effect immediately; however, cookies already stored on your device will not be removed until they expire or you delete them through your browser settings.</p>

          <h3>4.1 Browser-Level Cookie Management</h3>
          <p>In addition to the consent banner, you may manage cookies directly through your web browser settings:</p>
          <ul>
            <li><strong>Google Chrome:</strong> Settings &gt; Privacy and Security &gt; Cookies and other site data</li>
            <li><strong>Apple Safari:</strong> Preferences &gt; Privacy &gt; Cookies and website data</li>
            <li><strong>Mozilla Firefox:</strong> Settings &gt; Privacy &amp; Security &gt; Cookies and Site Data</li>
            <li><strong>Microsoft Edge:</strong> Settings &gt; Cookies and site permissions &gt; Manage and delete cookies and site data</li>
          </ul>
          <p>For comprehensive browser-specific instructions, visit <a href="https://www.allaboutcookies.org" target="_blank" rel="noopener noreferrer">www.allaboutcookies.org</a>.</p>
          <p>Please note that disabling essential cookies via your browser may prevent certain Platform features from functioning correctly, including authentication, payments, and session management.</p>

          <h3>4.2 Google Analytics Opt-Out</h3>
          <p>You may opt out of Google Analytics data collection by installing the <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">Google Analytics Opt-Out Browser Add-On</a>, which prevents the Google Analytics JavaScript from sharing information with Google Analytics about visit activity.</p>
        </section>

        <hr />

        <section>
          <h2>5. Other Tracking Technologies</h2>
          <p>In addition to cookies, the Platform may use the following technologies to collect information about your use of the Platform:</p>
          <ul>
            <li><strong>Web beacons (tracking pixels):</strong> Small, transparent image files embedded in web pages or emails that record when a page or email is opened. Used by Google Ads and Meta for conversion tracking and campaign measurement.</li>
            <li><strong>Local storage:</strong> A browser-based storage mechanism that allows the Platform to store data persistently on your device. Used for caching user preferences and consent settings.</li>
            <li><strong>Server-side analytics:</strong> Aggregated, anonymised data collected at the server level (e.g., page load times, error rates, geographic distribution of requests) that does not involve client-side tracking.</li>
          </ul>
          <p>These technologies serve the same purposes as the cookies described in Section 3. You may block web beacons and local storage through your browser&rsquo;s privacy settings, though doing so may affect Platform functionality.</p>
        </section>

        <hr />

        <section>
          <h2>6. Overseas Data Disclosure</h2>
          <p>In accordance with Australian Privacy Principle 8.1 (APP 8 &mdash; Cross-border disclosure of personal information), Baby Bloom discloses that the following third-party cookie providers process personal information outside Australia:</p>
          <ul>
            <li><strong>Google LLC (United States):</strong> Processes analytics data (IP address, device information, browsing behaviour) and advertising conversion data. Google&rsquo;s privacy policy is available at <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">policies.google.com/privacy</a>.</li>
            <li><strong>Meta Platforms, Inc. (United States):</strong> Processes behavioural tracking data for social sharing measurement and targeted advertising. Meta&rsquo;s privacy policy is available at <a href="https://www.facebook.com/privacy/policy" target="_blank" rel="noopener noreferrer">facebook.com/privacy/policy</a>.</li>
            <li><strong>Stripe, Inc. (United States):</strong> Processes fraud detection and payment session data. Because Stripe cookies are classified as essential (required for PCI DSS compliance), they cannot be declined when using payment features. Stripe&rsquo;s privacy policy is available at <a href="https://stripe.com/au/privacy" target="_blank" rel="noopener noreferrer">stripe.com/au/privacy</a>.</li>
          </ul>
          <p>By accepting non-essential cookies, you acknowledge and consent to your personal information being disclosed to and processed by these United States-based entities. United States privacy laws differ from Australian privacy laws, and the Australian Privacy Principles may not be enforceable in the United States. Baby Bloom does not have direct control over third-party data handling practices beyond the terms of our agreements with these providers.</p>
          <p><em>Note: Third-party privacy policy URLs were last verified on 14 March 2026 and may change without notice. Please visit the provider&rsquo;s website directly for current information.</em></p>
        </section>

        <hr />

        <section>
          <h2>7. Data Retention</h2>
          <ul>
            <li><strong>Session cookies:</strong> Deleted when you close your browser or after 30 minutes of inactivity, whichever occurs first.</li>
            <li><strong>Consent preferences cookie:</strong> Retained for 12 months from the date of your last preference selection. After expiry, the consent banner will be displayed again.</li>
            <li><strong>Google Analytics (_ga):</strong> 2 years from last activity. Refreshed on each visit.</li>
            <li><strong>Google Analytics (_gid):</strong> 24 hours from last activity.</li>
            <li><strong>Marketing cookies (_fbp, _gcl_au):</strong> 90 days from last activity.</li>
            <li><strong>Stripe cookies:</strong> __stripe_mid retained for 1 year; __stripe_sid retained for 30 minutes (session-based).</li>
          </ul>
          <p>If you clear your browser cookies, all cookies (including consent preferences) will be deleted. Non-essential cookies will not be re-set until you provide consent again via the consent banner.</p>
        </section>

        <hr />

        <section>
          <h2>8. Marketing Communications</h2>
          <p>If you accept marketing cookies, Baby Bloom and its advertising partners may serve you targeted advertisements on third-party platforms (e.g., Facebook, Google Display Network). Baby Bloom may also send promotional emails in compliance with the Spam Act 2003 (Cth). All marketing emails include:</p>
          <ul>
            <li>A functioning unsubscribe mechanism.</li>
            <li>Accurate sender identification: Baby Bloom Sydney Pty Ltd, ABN 17 463 812 867.</li>
            <li>A valid reply-to address: <a href="mailto:contact@babybloomsydney.com.au">contact@babybloomsydney.com.au</a>.</li>
          </ul>
          <p>You may opt out of marketing emails at any time by clicking &ldquo;Unsubscribe&rdquo; in any email or by adjusting your cookie preferences to disable marketing cookies.</p>
        </section>

        <hr />

        <section>
          <h2>9. Do Not Track (DNT) Signal</h2>
          <p>Baby Bloom respects the Do Not Track (DNT) browser signal. If your browser is configured to send a DNT signal, the Platform will not set marketing cookies, regardless of your cookie consent preferences. Analytics cookies may still be set if you have expressly consented to them via the consent banner.</p>
        </section>

        <hr />

        <section>
          <h2>10. Consent Withdrawal</h2>
          <p>You may withdraw your consent to non-essential cookies at any time by accessing the cookie preferences panel via the footer icon. Withdrawal of consent is prospective only &mdash; it does not affect the lawfulness of processing carried out prior to withdrawal. Upon withdrawal, non-essential cookies will not be set on subsequent page loads; however, cookies already stored on your device will persist until they expire or are manually deleted through your browser settings.</p>
        </section>

        <hr />

        <section>
          <h2>11. Your Rights Under the Privacy Act 1988</h2>
          <p>Under the Privacy Act 1988 (Cth), you have the right to:</p>
          <ul>
            <li><strong>Access</strong> the personal information we hold about you (APP 12).</li>
            <li><strong>Correct</strong> inaccurate or outdated personal information (APP 13). If you believe tracking data has been attributed to you incorrectly, you may request correction.</li>
            <li><strong>Complain</strong> about a breach of the Australian Privacy Principles.</li>
          </ul>
          <p>To exercise any of these rights in relation to cookie data, contact our Compliance Officer at <a href="mailto:compliance@babybloomsydney.com.au">compliance@babybloomsydney.com.au</a> with the subject line &ldquo;Cookie Data Request.&rdquo; Baby Bloom will respond within 30 days.</p>
          <p>If you are not satisfied with our response, you may lodge a complaint with the <strong>Office of the Australian Information Commissioner (OAIC)</strong> at <a href="https://www.oaic.gov.au" target="_blank" rel="noopener noreferrer">www.oaic.gov.au</a> or by telephone on 1300 363 992.</p>
        </section>

        <hr />

        <section>
          <h2>12. Changes to This Policy</h2>
          <p>Baby Bloom may update this Cookie Policy from time to time to reflect changes in our practices, technology, or applicable law. Material changes will be communicated by posting the updated Policy on the Platform with a revised &ldquo;Effective&rdquo; date. If a change materially affects your rights or requires renewed consent, we will notify you via the consent banner or by email (if you are a registered user).</p>
          <p>We recommend reviewing this Policy periodically to stay informed about our use of cookies.</p>
        </section>

        <hr />

        <section>
          <h2>13. Contact Information</h2>
          <p><strong>Baby Bloom Sydney Pty Ltd</strong><br />
          ABN: 17 463 812 867<br />
          Sydney, New South Wales, Australia</p>
          <ul>
            <li>General enquiries: <a href="mailto:contact@babybloomsydney.com.au">contact@babybloomsydney.com.au</a></li>
            <li>Support: <a href="mailto:support@babybloomsydney.com.au">support@babybloomsydney.com.au</a></li>
            <li>Privacy &amp; Compliance: <a href="mailto:compliance@babybloomsydney.com.au">compliance@babybloomsydney.com.au</a></li>
          </ul>
        </section>

        <hr />

        <p className="text-xs text-slate-400 italic">
          This Policy is governed by the laws of New South Wales, Australia. For full details of how Baby Bloom handles your personal information, see our <Link href="/legal/privacy-policy">Privacy Policy</Link>.
        </p>
      </div>

      {/* Interactive Cookie Preferences */}
      <section id="preferences" className="mt-10 scroll-mt-24">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Manage Your Cookie Preferences</h2>
        <p className="text-xs text-slate-500 mb-4">
          Use the toggles below to control which categories of cookies are active. Essential cookies cannot be disabled as they are required for the Platform to function. Changes take effect immediately.
        </p>
        <CookiePreferencesSection />
      </section>
    </article>
  );
}
