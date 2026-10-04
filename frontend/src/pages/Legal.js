import React from 'react';
import { Link } from 'react-router-dom';

const CONTACT = 'mowgli@junglelabsworld.com';
const UPDATED = 'October 3, 2026';

export function Privacy() {
  return (
    <div className="legal-page">
      <h1>Privacy Policy</h1>
      <p className="legal-meta">Last updated {UPDATED} · App-Thru is operated by Jungle Labs Inc., British Columbia, Canada.</p>

      <h2>What we collect</h2>
      <p>When you place an order we collect your <strong>name</strong>, <strong>mobile number</strong>, the items you order and any note you add for the kitchen. We use these only to prepare your order and to text you when it is ready.</p>
      <p><strong>Your account</strong> (optional): if you create an account we store your name, email, mobile number and order history. If you sign in with Apple or Google we receive your name, email and a sign-in identifier from them, never your Apple or Google password.</p>
      <p><strong>Payments</strong> are processed by Stripe. Your card number never touches App-Thru's servers; we only receive confirmation that a payment succeeded. If you choose to save a card or use Link, the card is stored by Stripe, not by App-Thru.</p>
      <p><strong>Voice ordering</strong> (optional): if you order by voice, your audio is sent to our speech and AI providers only to understand your order. It is not used to identify you or kept as a recording.</p>
      <p><strong>On your device</strong> we store your cart, recent order links, and your name and phone so checkout is faster next time. You can clear these anytime by clearing your browser or app data.</p>

      <h2>Who we share it with</h2>
      <p>Your order details go to the restaurant you ordered from (including its point-of-sale system) so they can prepare it. We use service providers to run App-Thru: Stripe (payments), Twilio (text messages), Resend (restaurant email alerts), Railway (hosting), and ElevenLabs and Anthropic (voice ordering only). We do not sell your personal information and we do not use it for advertising.</p>

      <h2>How long we keep it</h2>
      <p>Order records are kept for accounting and tax purposes as required by Canadian law, then deleted. You can ask us to delete your personal information at any time, except where we must keep it by law.</p>

      <h2>Deleting your account</h2>
      <p>You can delete your account in the app under <strong>Account → Delete account</strong>. See <Link to="/delete-account">how to delete your account</Link>.</p>

      <h2>Your rights</h2>
      <p>Under Canadian privacy law (PIPEDA and BC's PIPA) you can ask to see, correct or delete the personal information we hold about you. Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will respond within 30 days.</p>

      <h2>Children</h2>
      <p>App-Thru is not directed at children under 13 and we do not knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>If we change this policy we will update the date above. Questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      <p><Link to="/support">Support</Link> · <Link to="/">Home</Link></p>
    </div>
  );
}

export function Support() {
  return (
    <div className="legal-page">
      <h1>Help &amp; Support</h1>
      <p className="legal-meta">App-Thru — walk up, order ahead, skip the line.</p>

      <h2>Problem with an order?</h2>
      <p>Open your order (from the text we sent, or <Link to="/orders">Your Orders</Link>). Within 5 minutes of ordering you can cancel it there for a full refund. After that, use the <strong>Call the restaurant</strong> button on the order page and the team will help right away.</p>

      <h2>Refunds</h2>
      <p>Cancelled orders are refunded automatically to your original payment method. Refunds usually appear in 3–5 business days, depending on your bank.</p>

      <h2>Didn't get a text?</h2>
      <p>Check that the mobile number on your order is correct. Your order page always shows the live status and your pickup code.</p>

      <h2>Contact us</h2>
      <p>Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We reply within one business day.</p>
      <p><Link to="/privacy">Privacy Policy</Link> · <Link to="/">Home</Link></p>
    </div>
  );
}

export function DeleteAccount() {
  return (
    <div className="legal-page">
      <h1>Delete your App-Thru account</h1>
      <p className="legal-meta">App-Thru is operated by Jungle Labs Inc., British Columbia, Canada.</p>

      <h2>Delete it in the app (instant)</h2>
      <ol>
        <li>Open the App-Thru app and sign in.</li>
        <li>Tap <strong>Account</strong> in the bottom bar.</li>
        <li>Tap <strong>Delete account</strong> and confirm.</li>
      </ol>
      <p>Your account is deleted immediately and you are signed out.</p>

      <h2>Can't open the app?</h2>
      <p>Email <a href={`mailto:${CONTACT}?subject=Delete%20my%20App-Thru%20account`}>{CONTACT}</a> from the email address on your account with the subject "Delete my App-Thru account". We will delete it within 30 days and confirm by email.</p>

      <h2>What is deleted</h2>
      <p>Your profile (name, email, mobile number, profile photo), your Apple or Google sign-in link, and any cards saved with Stripe for your account.</p>

      <h2>What is kept</h2>
      <p>Receipts for orders you already placed (items, amount, date, and the name and phone number entered on that order) are unlinked from your account and kept for accounting and tax purposes as required by Canadian law (up to 6 years), then deleted. You can email us to ask for the name and phone on past orders to be removed where the law allows.</p>

      <p><Link to="/privacy">Privacy Policy</Link> · <Link to="/support">Support</Link></p>
    </div>
  );
}
