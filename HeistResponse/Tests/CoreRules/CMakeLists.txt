cmake_minimum_required(VERSION 3.16)
project(HeistResponseCoreRulesTests CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(CoreRulesTests CoreRulesTests.cpp)
target_include_directories(CoreRulesTests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../../Source/HeistResponse/Rules)
if (MSVC)
  target_compile_options(CoreRulesTests PRIVATE /W4 /WX)
else()
  target_compile_options(CoreRulesTests PRIVATE -Wall -Wextra -Wpedantic -Wshadow -Wconversion -Werror -fsanitize=address,undefined)
  target_link_options(CoreRulesTests PRIVATE -fsanitize=address,undefined)
endif()

enable_testing()
add_test(NAME CoreRules COMMAND CoreRulesTests)
