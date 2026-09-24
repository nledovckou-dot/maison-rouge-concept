(() => {
  const body = document.body;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const header = document.querySelector('#header');
  const menuToggle = document.querySelector('#menu-toggle');
  const navigation = document.querySelector('#main-nav');
  function updateHeader() { header.classList.toggle('is-scrolled', window.scrollY > 24); }
  updateHeader();
  window.addEventListener('scroll', updateHeader, { passive: true });
  function closeMenu() {
    header.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Открыть меню');
  }
  menuToggle.addEventListener('click', () => {
    const open = !header.classList.contains('is-open');
    header.classList.toggle('is-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  });
  navigation.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  const drinks = [
    {
      name: 'Trésor de Normandie',
      type: 'Авторский коктейль',
      note: 'Нежный, фруктовый, с медовым послевкусием.',
      ingredients: 'Джин Bee Gin, груша и айва, мёд алоэ, лимон, яичный белок.',
      image: 'assets/cocktail-2.jpg',
      alt: 'Коктейль Trésor de Normandie в бокале',
      palette: 'gold',
      glow: '#d9ba8d'
    },
    {
      name: 'La Rencontre',
      type: 'Авторский коктейль',
      note: 'Тропический акцент и яркое, игристое настроение.',
      ingredients: 'Джин Bee Gin и Bee Gin Rose, рислинг, апельсин, маракуйя, гуава.',
      image: 'assets/cocktail-3.jpg',
      alt: 'Коктейль La Rencontre на подносе',
      palette: 'ruby',
      glow: '#e38991'
    },
    {
      name: 'Коллекция Maison Rouge',
      type: '12 авторских историй',
      note: 'От лёгкого спритца до сложного вечернего вкуса.',
      ingredients: 'Откройте авторскую подборку ниже или изучите полную барную и винную карту.',
      image: 'assets/cocktail-1.jpg',
      alt: 'Подборка коктейлей Maison Rouge',
      palette: 'gold',
      glow: '#d8a37e'
    }
  ];
  for (const drink of drinks) { const preload = new Image(); preload.src = drink.image; }
  const cocktailSection = document.querySelector('.cocktails');
  const cocktailInfo = document.querySelector('.cocktail-showcase__info');
  const image = document.querySelector('#cocktail-image');
  const name = document.querySelector('#cocktail-name');
  const type = document.querySelector('#cocktail-type');
  const note = document.querySelector('#cocktail-note');
  const ingredients = document.querySelector('#cocktail-ingredients');
  const number = document.querySelector('#cocktail-number');
  const dots = Array.from(document.querySelectorAll('[data-cocktail]'));
  const peekPrev = document.querySelector('#cocktail-peek-prev');
  const peekNext = document.querySelector('#cocktail-peek-next');
  let selected = 0;
  let changeTimer;
  function showDrink(index) {
    const next = (index + drinks.length) % drinks.length;
    if (next === selected) return;
    selected = next;
    const drink = drinks[selected];
    clearTimeout(changeTimer);
    if (!reduceMotion) {
      image.classList.add('is-changing');
      cocktailInfo.classList.add('is-changing');
    }
    changeTimer = window.setTimeout(() => {
      image.src = drink.image;
      image.alt = drink.alt;
      name.textContent = drink.name;
      type.textContent = drink.type;
      note.textContent = drink.note;
      ingredients.textContent = drink.ingredients;
      number.textContent = `${String(selected + 1).padStart(2, '0')} / 03`;
      const previousDrink = drinks[(selected - 1 + drinks.length) % drinks.length];
      const nextDrink = drinks[(selected + 1) % drinks.length];
      peekPrev.querySelector('img').src = previousDrink.image;
      peekPrev.setAttribute('aria-label', `Показать ${previousDrink.name}`);
      peekNext.querySelector('img').src = nextDrink.image;
      peekNext.setAttribute('aria-label', `Показать ${nextDrink.name}`);
      cocktailSection.dataset.palette = drink.palette;
      cocktailSection.style.setProperty('--cocktail-glow', drink.glow);
      dots.forEach((dot, i) => {
        dot.classList.toggle('is-active', i === selected);
        dot.setAttribute('aria-pressed', String(i === selected));
      });
      image.classList.remove('is-changing');
      cocktailInfo.classList.remove('is-changing');
    }, reduceMotion ? 0 : 190);
  }
  document.querySelector('#cocktail-prev').addEventListener('click', () => showDrink(selected - 1));
  document.querySelector('#cocktail-next').addEventListener('click', () => showDrink(selected + 1));
  peekPrev.addEventListener('click', () => showDrink(selected - 1));
  peekNext.addEventListener('click', () => showDrink(selected + 1));
  dots.forEach(dot => dot.addEventListener('click', () => showDrink(Number(dot.dataset.cocktail))));

  if (!reduceMotion) {
    const art = document.querySelector('#cocktail-art');
    let scheduled = false;
    function updateCocktailMotion() {
      scheduled = false;
      const rect = art.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (window.innerHeight + rect.height)));
      cocktailSection.style.setProperty('--cocktail-progress', progress.toFixed(3));
    }
    function queueCocktailMotion() {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(updateCocktailMotion);
    }
    window.addEventListener('scroll', queueCocktailMotion, { passive: true });
    window.addEventListener('resize', queueCocktailMotion);
    queueCocktailMotion();
  }
})();
