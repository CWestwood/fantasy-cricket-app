import React, { useState } from 'react';
import { FiMenu, FiX } from 'react-icons/fi'; // Using react-icons for menu icons

const NavLink = ({ href, children }) => (
  <a
    href={href}
    className="block md:inline-block px-3 py-2 rounded-md text-base font-medium text-gray-300 hover:text-white hover:bg-dark-400 focus:outline-none focus:text-white focus:bg-dark-400 transition duration-150 ease-in-out"
  >
    {children}
  </a>
);

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const navLinks = [
    { href: '#home', text: 'Home' },
    { href: '#about', text: 'About' },
    { href: '#projects', text: 'Projects' },
    { href: '#contact', text: 'Contact' },
  ];

  return (
    <header className="bg-dark-500 shadow-card sticky top-0 z-50">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <a href="/" className="text-primary-500 text-2xl font-bold hover:text-primary-400 transition-colors duration-300">
              YourLogo
            </a>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-4">
              {navLinks.map((link) => (
                <NavLink key={link.href} href={link.href}>{link.text}</NavLink>
              ))}
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="-mr-2 flex md:hidden">
            <button
              onClick={toggleMenu}
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-primary-400 hover:text-white hover:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-800 focus:ring-white"
              aria-controls="mobile-menu"
              aria-expanded={isOpen}
            >
              <span className="sr-only">Open main menu</span>
              {isOpen ? (
                <FiX className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <FiMenu className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Sidebar */}
      <div
        className={`md:hidden fixed top-0 left-0 h-full w-64 bg-dark-600 shadow-xl transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } transition-transform duration-300 ease-in-out z-40`}
        id="mobile-menu"
      >
        <div className="pt-16">
            {/* Mobile Logo */}
            <div className="px-5 pb-5 border-b border-dark-400">
                <a href="/" className="text-primary-500 text-2xl font-bold">
                    YourLogo
                </a>
            </div>
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                {navLinks.map((link) => (
                    <NavLink key={link.href} href={link.href}>{link.text}</NavLink>
                ))}
            </div>
        </div>
      </div>

      {/* Overlay for mobile menu */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black opacity-50 z-30"
          onClick={toggleMenu}
        ></div>
      )}
    </header>
  );
};

export default Navbar;