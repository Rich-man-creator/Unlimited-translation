export default function Footer() {
    return (
      <footer>
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <h4>Unlimited Translation</h4>
              <p>Professional translation services powered by Deep Learning Neuroptogramming</p>
            </div>
            <div className="footer-section">
              <h4>Quick Links</h4>
              <ul>
                <li><a href="/">Home</a></li>
                <li><a href="/dashboard">Dashboard</a></li>
                <li><a href="/plans">Pricing</a></li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Support</h4>
              <ul>
                <li><a href="/contact">Contact Us</a></li>
                <li><a href="/faq">FAQ</a></li>
                <li><a href="/privacy">Privacy Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} Unlimited Translation. All rights reserved.</p>
          </div>
        </div>
      </footer>
    );
  }