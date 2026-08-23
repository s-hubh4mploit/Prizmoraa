// js/policy-modal.js
// Self-contained "Refund, Return & Exchange Policy" popup.
// Injects a modal into the page and wires it up to any button with
// id="policyModalBtn". Include this script + link a button with that id
// on any page where you want the policy popup available.

document.addEventListener('DOMContentLoaded', () => {
  const trigger = document.getElementById('policyModalBtn');
  if (!trigger) return;

  const overlay = document.createElement('div');
  overlay.id = 'policyModalOverlay';
  overlay.className = 'policy-modal-overlay';
  overlay.innerHTML = `
    <div class="policy-modal" role="dialog" aria-modal="true" aria-labelledby="policyModalTitle">
      <button class="policy-modal-close" id="policyModalClose" aria-label="Close">&times;</button>
      <h2 id="policyModalTitle">Returns, Refund &amp; Exchange Policy</h2>
      <p class="policy-modal-updated">Effective Date: 24 August 2026</p>

      <p>At PRIZMORAA, we carefully inspect and pack every piece before it leaves our hands. We want you to love every piece you receive. Because our jewellery is delicate and personal-wear merchandise, we have a limited return and exchange policy to maintain hygiene, quality and product integrity.</p>

      <h3>1. Eligibility for Returns</h3>
      <p>We accept return requests only in the following situations:</p>
      <ul>
        <li>The product received is damaged or defective.</li>
        <li>You received a wrong product.</li>
        <li>You received a product that is materially different from the product ordered or advertised.</li>
        <li>Any other return circumstance required under applicable consumer law.</li>
      </ul>
      <p>Return requests must be raised within 48 hours of delivery. To report an issue, please contact us with your order number, clear photographs of the product and packaging, and a short video showing the issue where applicable. An unboxing video is strongly recommended, particularly for claims relating to damage, missing items or an incorrect product.</p>

      <h3>2. Products That Cannot Be Returned</h3>
      <p>For hygiene and product-safety reasons, we generally do not accept returns for products that have been worn, used, altered, resized or modified; products with missing tags, packaging or accessories; products damaged after delivery due to misuse; products showing scratches, stains or other signs of use; products returned without original packaging; or returns requested solely because the customer changed their mind. This does not limit any rights available under applicable law.</p>

      <h3>3. Return Conditions</h3>
      <p>For an approved return, the product must be unused and in its original condition, with all original packaging, tags, cards and accessories included, and securely packed to prevent transit damage. PRIZMORAA may inspect the returned product before approving a refund or exchange.</p>

      <h3>4. Damaged Products</h3>
      <p>If your parcel arrives damaged, please photograph/video the package before opening it, wherever possible, and contact us within 48 hours of delivery. After review, we may offer a replacement, an exchange of equivalent value, or a refund. PRIZMORAA will bear the return shipping cost for an approved damaged-product claim attributable to us or our delivery arrangements.</p>

      <h3>5. Wrong Product Received</h3>
      <p>Please notify us within 48 hours of delivery. After verification, we will arrange a replacement or refund. Where the error is attributable to PRIZMORAA, the applicable shipping cost will be borne by us.</p>

      <h3>6. Exchange Policy</h3>
      <p>Exchanges are offered only for eligible products and approved cases, requested within 48 hours of delivery. The product must be unused, unworn, and returned in original condition and packaging, subject to availability. Price differences are payable or refundable as applicable.</p>

      <h3>7. Change of Mind / Personal Preference</h3>
      <p>We currently do not offer returns or exchanges simply because a customer changed their mind or has a personal preference regarding design, colour, appearance or size. This does not affect any mandatory rights available under applicable law.</p>

      <h3>8. Refunds</h3>
      <p>Once an eligible return is received and inspected, we will notify you regarding approval or rejection. Approved refunds are processed through the original payment method wherever possible; for COD orders, via UPI or bank transfer after you provide the required details. Timing may vary by payment provider or bank.</p>

      <h3>9. Shipping Charges</h3>
      <p>Original shipping charges are generally non-refundable, except where the return is due to an error attributable to PRIZMORAA, a defective/damaged product, or as required by law. For customer-requested returns, return shipping charges may be borne by the customer.</p>

      <h3>10. Cancellation Policy</h3>
      <p>Orders may be cancelled by contacting us as soon as possible, only before the order has been processed or dispatched. Once dispatched, an order cannot normally be cancelled. Approved cancellations are refunded to the original payment method.</p>

      <h3>11. Incorrect Address / Failed Delivery</h3>
      <p>Customers are responsible for providing a complete and accurate delivery address and contact information. If an order is returned due to an incorrect address, incorrect phone number, unavailability, or repeated refusal, additional shipping charges may apply for re-dispatch. We reserve the right to restrict future COD orders in such cases, subject to applicable law.</p>

      <h3>12. Product Care and Normal Wear</h3>
      <p>PRIZMORAA jewellery should be handled with care. Normal wear and tear, scratches, accidental damage, or exposure to chemicals, perfumes, cosmetics, sweat, water or cleaning products may affect appearance and finish, and do not automatically qualify a product for return or refund. Please follow the care instructions supplied with your order.</p>

      <h3>13. Missing Items</h3>
      <p>If an item appears to be missing from your package, contact us within 48 hours of delivery with your order number and supporting photographs/video. We will investigate and provide an appropriate resolution after verification.</p>

      <h3>14. How to Request a Return or Exchange</h3>
      <p>Email us with the subject "Return / Exchange Request – Order #[ORDER NUMBER]" and include your order number, name, contact number, product name, reason for the request, and supporting photographs/videos. Our team will review and respond with next steps.</p>

      <h3>15. Inspection and Approval</h3>
      <p>Submitting a return request does not automatically guarantee approval. All returned products are subject to inspection, and PRIZMORAA reserves the right to reject a return that does not meet the eligibility requirements above, subject always to applicable consumer law.</p>

      <h3>16. Grievance Redressal</h3>
      <p>If you have any concern regarding your order, return, exchange or refund, please contact us first so we can try to resolve the issue promptly.</p>

      <h3>17. Policy Updates</h3>
      <p>PRIZMORAA may update this policy from time to time. Any updated version will be published on this page with the revised effective date.</p>

      <p class="policy-modal-footer-note">By placing an order with PRIZMORAA, you acknowledge that you have read and understood this Returns, Refund &amp; Exchange Policy.<br>PRIZMORAA — Wear Your Shine.</p>
    </div>
  `;
  document.body.appendChild(overlay);

  const closeBtn = document.getElementById('policyModalClose');

  function openModal() {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    openModal();
  });
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
  });
});