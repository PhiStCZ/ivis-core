from .TrainingParams import TrainingParams


class FeedforwardTrainingParams(TrainingParams):
    """Class representing the parameters for a feedforward model for `run_training` function."""

    def __init__(self, training_params: TrainingParams):
        super().__init__()
        self.hidden_layers = []   # Sizes of hidden layers.
        self.__dict__.update(training_params.__dict__)

    def __str__(self):
        return super().__str__() + \
            "\nHidden layers:" + \
            str(self.hidden_layers)
