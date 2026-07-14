import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import QRLib from 'qrcode';
import QRCode from '../components/QRCode';

function SetupGuide() {
  const { id } = useParams();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    fetch(`/api/restaurants/${id}`)
      .then(r => r.json())
      .then(data => { setRestaurant(data); setLoading(false); });
  }, [id]);

  const baseUrl = window.location.origin;

  const copyUrl = (url, label) => {
    navigator.clipboard?.writeText(url);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const orderUrl = `${baseUrl}/restaurant/${id}`;

  // Open a printable page with large QR signs (order-on-phone + kiosk)
  const printSigns = async () => {
    const qrData = await QRLib.toDataURL(orderUrl, { width: 480, margin: 1 });
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html><head><title>App-Thru QR Signs — ${restaurant.name}</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; margin: 0; }
        .sign { page-break-after: always; padding: 60px 20px; }
        h1 { font-size: 42px; margin: 10px 0; }
        p { font-size: 22px; color: #444; margin: 8px 0; }
        img { width: 380px; height: 380px; margin: 24px 0; }
        .small { font-size: 15px; color: #888; }
      </style></head><body>
        <div class="sign">
          <h1>${restaurant.name}</h1>
          <p><strong>Skip the line — order from your phone</strong></p>
          <img src="${qrData}" alt="QR" />
          <p>Scan, order, and we'll text you when it's ready.</p>
          <p class="small">${orderUrl}</p>
        </div>
      </body></html>`);
    w.document.close();
    w.onload = () => w.print();
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!restaurant) return <div className="error-page"><h2>Restaurant not found</h2></div>;

  return (
    <div className="setup-page">
      <div className="setup-header">
        <span className="setup-check">✅</span>
        <h1>{restaurant.name} is live on App-Thru!</h1>
        <p>Follow these steps to get your outdoor kiosk up and running in 15 minutes.</p>
      </div>

      <div className="setup-urls">
        <h2>Your Links</h2>
        <div className="setup-url-grid">
          {[
            { label: 'Kiosk Screen', icon: '📺', url: `${baseUrl}/kiosk/${id}`, desc: 'Open this on the outdoor tablet' },
            { label: 'Kitchen Queue', icon: '🍳', url: `${baseUrl}/kitchen`, desc: 'Open this on a screen in the kitchen' },
            { label: 'Dashboard', icon: '📊', url: `${baseUrl}/merchant/${id}`, desc: 'Track orders and revenue' },
            { label: 'Settings', icon: '⚙️', url: `${baseUrl}/admin/${id}`, desc: 'Change greeting, instructions' },
          ].map(link => (
            <div key={link.label} className="setup-url-card">
              <span className="setup-url-icon">{link.icon}</span>
              <div className="setup-url-info">
                <strong>{link.label}</strong>
                <code>{link.url}</code>
                <small>{link.desc}</small>
              </div>
              <button
                className="setup-copy-btn"
                onClick={() => copyUrl(link.url, link.label)}
              >
                {copied === link.label ? 'Copied!' : 'Copy'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="setup-qr">
        <h2>Scan-to-Order QR Signs</h2>
        <p>Print these and put them on your door, tables, and counter. Customers scan and order from their phone — no app download.</p>
        <div className="setup-qr-row">
          <div className="setup-qr-card">
            <QRCode value={orderUrl} size={170} />
            <strong>Order on your phone</strong>
            <code>{orderUrl}</code>
          </div>
          <div className="setup-qr-card">
            <QRCode value={`${baseUrl}/kiosk/${id}`} size={170} />
            <strong>Kiosk screen link</strong>
            <code>{`${baseUrl}/kiosk/${id}`}</code>
          </div>
        </div>
        <button className="btn-primary" onClick={printSigns}>🖨️ Print QR signs</button>
      </div>


      <div className="setup-steps">
        <h2>Setup Your Hardware</h2>

        <div className="setup-step">
          <div className="setup-step-num">1</div>
          <div className="setup-step-content">
            <h3>Get a tablet</h3>
            <p>
              Any tablet works — <strong>iPad</strong> (10th gen, ~$350) or <strong>Samsung Galaxy Tab A9+</strong> (~$270)
              are our recommendations. Make sure it has a camera and microphone.
            </p>
          </div>
        </div>

        <div className="setup-step">
          <div className="setup-step-num">2</div>
          <div className="setup-step-content">
            <h3>Open the kiosk on the tablet</h3>
            <ol className="setup-substeps">
              <li>Open <strong>Chrome</strong> on the tablet</li>
              <li>Go to: <code>{baseUrl}/kiosk/{id}</code></li>
              <li>Tap the <strong>Share</strong> button → <strong>"Add to Home Screen"</strong></li>
              <li>Open the new app icon — it runs fullscreen</li>
              <li>Allow <strong>camera</strong> (for walk-up sensor) and <strong>microphone</strong> (for voice)</li>
            </ol>
          </div>
        </div>

        <div className="setup-step">
          <div className="setup-step-num">3</div>
          <div className="setup-step-content">
            <h3>Get a card reader (optional)</h3>
            <p>
              For payments, get a <strong>Square Reader</strong> ($49) or <strong>Stripe Terminal</strong> ($249).
              Place it next to the tablet. Customers tap their card when prompted.
            </p>
          </div>
        </div>

        <div className="setup-step">
          <div className="setup-step-num">4</div>
          <div className="setup-step-content">
            <h3>Mount it outside</h3>
            <p>
              Get a <strong>waterproof tablet enclosure</strong> ($150-300) and mount it near your entrance.
              Plug in power via a weatherproof outdoor outlet or long USB-C cable.
              Make sure WiFi reaches outside (use a range extender if needed, ~$30).
            </p>
          </div>
        </div>

        <div className="setup-step">
          <div className="setup-step-num">5</div>
          <div className="setup-step-content">
            <h3>Set up the kitchen</h3>
            <ol className="setup-substeps">
              <li>Open <code>{baseUrl}/kitchen</code> on any phone, tablet, or laptop in the kitchen</li>
              <li>Bookmark it</li>
              <li>When an order comes in, tap <strong>"Mark Ready"</strong> — the customer's phone buzzes instantly</li>
            </ol>
          </div>
        </div>

        <div className="setup-step">
          <div className="setup-step-num">6</div>
          <div className="setup-step-content">
            <h3>You're live! 🎉</h3>
            <p>
              The kiosk shows a food slideshow when idle. When a customer walks up,
              the camera sensor detects them and the AI starts taking their order.
              They get a pickup code and a phone notification when the food is ready.
            </p>
          </div>
        </div>
      </div>

      <div className="setup-cost">
        <h2>Total Cost</h2>
        <div className="setup-cost-grid">
          <div className="setup-cost-item">
            <span>Tablet</span><span>$270 - $350</span>
          </div>
          <div className="setup-cost-item">
            <span>Kiosk enclosure</span><span>$150 - $300</span>
          </div>
          <div className="setup-cost-item">
            <span>Card reader</span><span>$49 - $299</span>
          </div>
          <div className="setup-cost-item">
            <span>Power + WiFi</span><span>$30 - $50</span>
          </div>
          <div className="setup-cost-item setup-cost-total">
            <span>Total</span><span>$499 - $999</span>
          </div>
        </div>
        <p className="setup-cost-compare">
          Compare: a traditional drive-through lane costs $50,000 - $200,000 to build.
        </p>
      </div>

      <div className="setup-actions">
        <Link to={`/kiosk/${id}`} className="landing-btn-primary" target="_blank">
          📺 Preview Your Kiosk
        </Link>
        <Link to={`/merchant/${id}`} className="landing-btn-secondary">
          📊 Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default SetupGuide;
