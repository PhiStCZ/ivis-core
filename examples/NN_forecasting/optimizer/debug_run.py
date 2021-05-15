#!/usr/bin/env python3
import json
import sys
from ivis import ivis
# mock IVIS
with open('example_entities.json') as entities_file:
    ivis.entities = json.load(entities_file)

from optimizer import *


def run_training(training_params):
    print(training_params.to_json())
    return {
        "train_loss": 1.22,
        "test_loss": 3.4,
    }


def finish_training(save_model):
    pass


def print_log(message):
    print(message)


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] != "docs":
        with open('example_params.json') as params_file:
            params = json.load(params_file)
    else:
        with open('example_params_docs.json') as params_file:
            params = json.load(params_file)
    run_optimizer(params, run_training, finish_training, print_log)
