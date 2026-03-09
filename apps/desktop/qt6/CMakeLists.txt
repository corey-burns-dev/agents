cmake_minimum_required(VERSION 3.16)
project(agents_qt6 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)

find_package(Qt6 REQUIRED COMPONENTS
  Core
  Gui
  Widgets
  WebEngineCore
  WebEngineWidgets
)

qt_standard_project_setup()

qt_add_executable(agents_qt6
  src/main.cpp
)

target_link_libraries(agents_qt6 PRIVATE
  Qt6::Core
  Qt6::Gui
  Qt6::Widgets
  Qt6::WebEngineCore
  Qt6::WebEngineWidgets
)

install(TARGETS agents_qt6 RUNTIME DESTINATION bin)
