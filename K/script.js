document.addEventListener('DOMContentLoaded', () => {
    const currentYear = document.getElementById('year');
    if (currentYear) {
        currentYear.textContent = new Date().getFullYear();
    }

    const navToggle = document.querySelector('.nav-toggle');
    const nav = document.querySelector('.nav');

    if (navToggle && nav) {
        navToggle.addEventListener('click', () => {
            const isOpen = nav.classList.toggle('open');
            navToggle.setAttribute('aria-expanded', String(isOpen));
        });
    }

    const feedback = document.getElementById('form-feedback');
    const contactForm = document.querySelector('.contact-form');

    if (contactForm && feedback) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const message = document.getElementById('message').value.trim();

            feedback.classList.remove('error');

            if (!name || !email || !message) {
                feedback.classList.add('error');
                feedback.textContent = 'Please fill in all required fields.';
                return;
            }

            feedback.textContent = `Thanks, ${name}! Your message has been received.`;
            contactForm.reset();
        });
    }
});