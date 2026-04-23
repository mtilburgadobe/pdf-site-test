/**
 * Hero block decoration.
 * Authored DA pages wrap the background `<picture>` in a `<p>`; unwrap it so
 * the picture can absolutely-position over the hero's navy gradient.
 */
export default function decorate(block) {
  block.querySelectorAll('p').forEach((p) => {
    const picture = p.querySelector('picture');
    if (picture && p.textContent.trim() === '') {
      p.replaceWith(picture);
    }
  });
}
