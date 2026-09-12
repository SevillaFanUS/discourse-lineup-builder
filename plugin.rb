# frozen_string_literal: true

# name: discourse-lineup-builder
# about: Pick a formation, fill it with squad players, and post the XI into a topic.
# version: 0.2.0
# authors: Chris Lail
# url: https://github.com/SevillaFanUS/discourse-lineup-builder
# required_version: 3.0.0

enabled_site_setting :lineup_builder_enabled

register_asset "stylesheets/lineup-builder.scss"

module ::LineupBuilder
  PLUGIN_NAME = "discourse-lineup-builder"
end

after_initialize do
  # This install does not Zeitwerk-autoload plugin app/ files, so the
  # controller is required explicitly.
  require_relative "app/controllers/lineup_builder_controller"

  Discourse::Application.routes.append do
    get "/lineup" => "lineup_builder#index", :format => false
  end
end
