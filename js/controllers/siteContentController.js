import { supabase } from '../supabaseClient.js';
import { safeUrl } from '../views/dom.js';

export async function init() {
  if (!supabase) return;
  const { data, error } = await supabase.from('site_settings').select('key,value').eq('is_public', true);
  if (error || !data?.length) return;
  const settings = Object.fromEntries(data.map((row) => [row.key, row.value]));
  const title = document.getElementById('site-title');
  const tagline = document.querySelector('.hero-est');
  const motto = document.querySelector('.hero-motto');
  if (settings.homepage_hero_title && title) title.textContent = settings.homepage_hero_title;
  if (settings.homepage_hero_tagline && tagline) tagline.textContent = settings.homepage_hero_tagline;
  if (settings.campus_motto && motto) motto.replaceChildren(document.createTextNode(`“${settings.campus_motto}”`));
  if (settings.campus_established && tagline) tagline.textContent += ` · Established ${settings.campus_established}`;

  const heroUrl = safeUrl(settings.homepage_hero_image_url);
  if (heroUrl) {
    const background = heroUrl.replace(/["'()\\\n\r]/g, (char) => encodeURIComponent(char));
    document.querySelector('.hero')?.style.setProperty('--cms-hero-image', `url("${background}")`);
  }
  const logoUrl = safeUrl(settings.brand_logo_url);
  if (logoUrl) {
    document.querySelectorAll('.brand-mark').forEach((mark) => {
      const image = document.createElement('img');
      image.src = logoUrl; image.alt = ''; image.loading = 'eager';
      mark.replaceChildren(image);
    });
  }
}
