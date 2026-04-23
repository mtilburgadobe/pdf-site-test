/**
 * Hero block decoration.
 *
 * The authored plain.html stores the hero like this:
 *   <div class="hero">
 *     <div> <!-- row -->
 *       <div> <!-- cell -->
 *         <p><picture>…</picture></p>  (picture wrapped in <p> after md round-trip)
 *         <h3>kicker</h3>
 *         <h1>title</h1>
 *         <p>intro text</p>
 *         <p>buttons</p>
 *       </div>
 *     </div>
 *   </div>
 *
 * For the background image to absolutely fill the hero block we need the
 * <picture> to be a direct child of .hero (so `inset: 0` resolves to the
 * full hero, not the narrower content wrapper). This decoration lifts the
 * picture out of its containing <p> and cell/row wrappers and prepends it
 * to the hero block.
 */
export default function decorate(block) {
  const picture = block.querySelector('picture');
  if (picture) {
    const containingP = picture.closest('p');
    if (containingP && containingP.textContent.trim() === '') {
      containingP.remove();
    } else {
      picture.remove();
    }
    block.prepend(picture);
  }
}
