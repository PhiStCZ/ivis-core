import ivis.nn.optimizer as opt


def run_optimizer(parameters, run_training_callback, finish_training_callback, log_callback):
    """
    Runs the optimizer to try to find the best possible model for the data.

    Parameters
    ----------
    parameters : dict
        The parameters from user parsed from the JSON parameters of the IVIS Job. It should also contain the signal set,
        signals and their types in the `entities` value.
    run_training_callback : callable
        Function to run the Training task. Receives the current training parameters and should return the computed
        losses returned by the Training task.
    finish_training_callback : callable
        The only boolean argument passed to this function determines whether the trained model is the best one and
        should be saved to IVIS. This callback needs to pass the request to save the model to the Trainer Wrapper.
    log_callback : callable
        Function to print to Job log.
    """

    # prepare the parameters
    training_params = opt.default_training_params(parameters)

    training_params.architecture = "feedforward"
    training_params.split = {"train": 0.7, "val": 0, "test": 0.3}

    # print(training_params)

    for i in range(1):

        # do some magic...

        log_callback(f"Starting iteration {i}.")
        training_result = run_training_callback(training_params)
        log_callback(f"Result: {training_result['test_loss']}.")
        save_model = True
        finish_training_callback(save_model)
