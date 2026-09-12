# frozen_string_literal: true

# Static checks, plus the JavaScript geometry suite:
#
#   ruby script/check.rb

require "yaml"

ROOT = File.expand_path("..", __dir__)
FAILURES = []

def check(name)
  result = yield
  if result == true
    puts "  ok    #{name}"
  else
    puts "  FAIL  #{name}#{result.is_a?(String) ? " — #{result}" : ""}"
    FAILURES << name
  end
rescue => e
  puts "  ERROR #{name} — #{e.class}: #{e.message}"
  FAILURES << name
end

plugin_rb = File.read(File.join(ROOT, "plugin.rb"))

puts "\nPlugin wiring"

check("every require_relative resolves") do
  missing =
    plugin_rb.scan(/require_relative "([^"]+)"/).flatten.reject do |path|
      File.exist?(File.join(ROOT, "#{path}.rb"))
    end
  missing.empty? || "missing: #{missing.join(", ")}"
end

# register_asset resolves inside assets/, not from the plugin root.
check("register_asset paths exist under assets/") do
  missing =
    plugin_rb.scan(/register_asset "([^"]+)"/).flatten.reject do |path|
      File.exist?(File.join(ROOT, "assets", path))
    end
  missing.empty? || "not under assets/: #{missing.join(", ")}"
end

check("the route sets format: false") do
  plugin_rb.include?(":format => false") || "a bare /lineup would swallow /lineup.json"
end

puts "\nSettings"

declared = YAML.load_file(File.join(ROOT, "config/settings.yml"))["plugins"].keys.sort
described =
  YAML.load_file(File.join(ROOT, "config/locales/server.en.yml"))["en"]["site_settings"].keys.sort

check("every declared setting has a description") do
  missing = declared - described
  missing.empty? || missing.join(", ")
end

check("enabled_site_setting is declared") do
  name = plugin_rb[/enabled_site_setting :(\w+)/, 1]
  declared.include?(name) || "#{name} missing"
end

# Settings read in the browser must be client: true or they are simply
# absent, and the failure is silent.
check("settings used by the front end are exposed to the client") do
  js = Dir[File.join(ROOT, "assets/javascripts/**/*.js")].map { |f| File.read(f) }.join
  used = js.scan(/site\?\.(lineup_builder_\w+)/).flatten.uniq
  yaml = YAML.load_file(File.join(ROOT, "config/settings.yml"))["plugins"]
  not_client = used.reject { |name| yaml.dig(name, "client") }
  not_client.empty? || "not client-visible: #{not_client.join(", ")}"
end

puts "\nJavaScript"

js_files = Dir[File.join(ROOT, "assets/javascripts/**/*.js")]

check("javascript parses") do
  bad = js_files.reject { |f| system("node", "--check", f, out: File::NULL, err: File::NULL) }
  bad.empty? || bad.map { |f| File.basename(f) }.join(", ")
end

check("imported plugin modules resolve to real files") do
  js = js_files.map { |f| File.read(f) }.join
  missing =
    js
      .scan(%r{from "discourse/plugins/([^/]+)/discourse/([^"]+)"})
      .map { |_plugin, path| path }
      .uniq
      .reject { |path| File.exist?(File.join(ROOT, "assets/javascripts/discourse", "#{path}.js")) }
  missing.empty? || "no such file: #{missing.join(", ")}"
end

check("the plugin name in import paths matches plugin.rb") do
  declared_name = plugin_rb[/^# name: (\S+)/, 1]
  js = js_files.map { |f| File.read(f) }.join
  used = js.scan(%r{from "discourse/plugins/([^/]+)/}).flatten.uniq
  wrong = used.reject { |n| n == declared_name }
  wrong.empty? || "imports use #{wrong.join(", ")} but the plugin is #{declared_name}"
end

check("user-supplied text is escaped before it reaches innerHTML") do
  js = File.read(File.join(ROOT, "assets/javascripts/discourse/api-initializers/lineup-builder.js"))
  js.include?("function escapeHtml") || "no escapeHtml helper"
end

puts "\nFormation geometry"

output = `node #{File.join(ROOT, "script/formations_check.mjs")} 2>&1`
passed = output.scan(/^  ok  /).size
failed = output.scan(/^  FAIL/).size

output.lines.select { |l| l.start_with?("  FAIL", "  ERROR") }.each { |l| puts l }

check("the geometry suite passes") do
  failed.zero? || "#{failed} geometry checks failed — run script/formations_check.mjs"
end

puts "  ok    #{passed} geometry checks" if failed.zero?

puts
if FAILURES.empty?
  puts "All checks passed."
else
  puts "#{FAILURES.size} failed: #{FAILURES.join(", ")}"
  exit 1
end
