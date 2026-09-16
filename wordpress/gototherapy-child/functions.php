<?php
/**
 * Gototherapy child theme — enqueues the design system, the platform frontend
 * scripts (as ES modules) and the Elementor bridge stylesheet.
 *
 * Copy the repository's assets/ and data/ folders into this theme folder:
 *   wp-content/themes/gototherapy-child/assets/…
 *   wp-content/themes/gototherapy-child/data/…
 * The scripts resolve the data files relative to their own URL, so search,
 * profiles, booking and the account prototype work immediately. When the
 * Gototherapy plugin is installed, point assets/js/data.js at its REST routes
 * (see BACKEND-INTEGRATION.md) and swap the HTML widgets for its shortcodes.
 */
if (!defined('ABSPATH')) { exit; }

define('GT_CHILD_VERSION', '1.0.0');

add_action('wp_enqueue_scripts', function () {
    $uri = get_stylesheet_directory_uri();
    $dir = get_stylesheet_directory();
    $ver = function ($rel) use ($dir) { $f = $dir . $rel; return file_exists($f) ? (string) filemtime($f) : GT_CHILD_VERSION; };

    // Fonts: the two families the design system allows.
    wp_enqueue_style('gt-fonts', 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Schibsted+Grotesk:wght@400;500;600&display=swap', [], null);

    // Design system, in order. Loaded after the parent and Elementor kit so the site's classes win.
    $sheets = ['variables', 'base', 'layout', 'components', 'pages', 'responsive', 'elementor-bridge'];
    $prev = ['hello-elementor-theme-style', 'elementor-frontend'];
    foreach ($sheets as $s) {
        $rel = "/assets/css/{$s}.css";
        wp_enqueue_style("gt-{$s}", $uri . $rel, $prev, $ver($rel));
        $prev = ["gt-{$s}"];
    }

    // Platform scripts as an ES module (deferred by default; nothing on the page depends on it to be visible).
    $rel = '/assets/js/main.js';
    wp_enqueue_script('gt-main', $uri . $rel, [], $ver($rel), true);
});

// Mark the module script as type="module".
add_filter('script_loader_tag', function ($tag, $handle, $src) {
    if ($handle === 'gt-main') {
        return '<script type="module" src="' . esc_url($src) . '"></script>' . "\n";
    }
    return $tag;
}, 10, 3);

// Add the `js` class hook target and let the scripts find the page marker inside Elementor widgets.
add_filter('body_class', function ($classes) { $classes[] = 'gt'; return $classes; });

// Skip link (the header template also renders one; this covers pages built without it).
add_action('wp_body_open', function () {
    echo '<a class="skip-link" href="#main">Skip to content</a>';
});

// noindex for the utility pages the SEO document requires (Yoast can also set this; belt and braces).
add_action('wp_head', function () {
    if (is_page(['login', 'account', 'thank-you'])) {
        echo '<meta name="robots" content="noindex, follow">' . "\n";
    }
}, 1);

// Allow SVG upload for the temporary wordmark / favicon.
add_filter('upload_mimes', function ($m) { $m['svg'] = 'image/svg+xml'; return $m; });
