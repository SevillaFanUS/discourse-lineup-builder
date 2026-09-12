# frozen_string_literal: true

# Serves the builder page. Everything else happens in the browser: the
# squad comes from the players plugin's existing public endpoint, and a
# finished XI goes into the composer rather than into a table here.
class LineupBuilderController < ::ApplicationController
  skip_before_action :check_xhr, :preload_json, only: %i[index], raise: false

  def index
    render "default/empty"
  end
end
