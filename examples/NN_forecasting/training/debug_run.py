#!/usr/bin/env python3
import json
import sys
from ivis.nn import TrainingParams
from training import *

# histogram query is default
# start with argument "docs" to use docs query
if __name__ == "__main__":

    if len(sys.argv) < 2 or sys.argv[1] != "docs":
        with open('example_training_params.json') as params_file:
            params = TrainingParams().from_json(params_file.read())
        with open('histogram.json') as results_file:
            results = json.load(results_file)
        model_save_path = "../prediction/example_histogram/"
    else:
        with open('example_training_params_docs.json') as params_file:
            params = TrainingParams().from_json(params_file.read())
        with open('docs.json') as results_file:
            results = json.load(results_file)
        model_save_path = "../prediction/example_docs/"

    run_training(params, results, model_save_path)
